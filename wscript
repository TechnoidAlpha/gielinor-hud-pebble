#
# This file is the default set of rules to compile a Pebble application.
#
# Feel free to customize this to your needs.
#
import os.path

top = '.'
out = 'build'


def options(ctx):
    ctx.load('pebble_sdk')


def configure(ctx):
    """
    This method is used to configure your build. ctx.load(`pebble_sdk`) automatically configures
    a build for each valid platform in `targetPlatforms`. Platform-specific configuration: add your
    change after calling ctx.load('pebble_sdk') and make sure to set the correct environment first.
    Universal configuration: add your change prior to calling ctx.load('pebble_sdk').
    """
    ctx.load('pebble_sdk')


def build(ctx):
    # Each watch compiles its own copy of main.js without the other watch's layout
    # (tools/gen_layouts.py writes src/embeddedjs/gen/; manifest.json points each platform at its
    # copy). pebble-tool compiles the JS (mcrun) BEFORE this script runs, so when the generator
    # changed a file that compile used the old copy: run mcrun again, the same way pebble-tool
    # does, so the bundle always carries the current code.
    import shutil, subprocess, sys
    rc = subprocess.call([sys.executable, os.path.join(ctx.path.abspath(), 'tools', 'gen_layouts.py'), '--status'])
    if rc not in (0, 3):
        ctx.fatal('tools/gen_layouts.py failed')
    if rc == 3:
        import json
        root = ctx.path.abspath()
        platforms = json.load(open(os.path.join(root, 'package.json')))['pebble']['targetPlatforms']
        debug = os.path.exists(os.path.join(root, 'build', '.pebble_debug'))   # pebble-tool's DEBUG_BUILD_MARKER
        variant = 'debug' if debug else 'release'
        for platform in platforms:
            out = os.path.join(root, 'build', 'mods', platform, 'mcrun')
            cmd = ['mcrun', '-m', os.path.join(root, 'src', 'embeddedjs', 'manifest.json'), '-f', 'x',
                   '-p', 'pebble/' + platform, '-t', 'build', '-o', out, '-s', 'tech.moddable.pebble']
            if debug:
                cmd.append('-d')
            subprocess.check_call(cmd, cwd=root, stdout=subprocess.DEVNULL)
            shutil.copy2(os.path.join(out, 'bin', 'pebble', variant, 'embeddedjs', 'mc.xsa'),
                         os.path.join(root, 'build', 'mods', platform, 'mc.xsa'))
        print('gen_layouts: main.js changed, recompiled the mods')
    ctx.load('pebble_sdk')

    build_worker = os.path.exists('worker_src')
    binaries = []

    cached_env = ctx.env
    for platform in ctx.env.TARGET_PLATFORMS:
        ctx.env = ctx.all_envs[platform]
        ctx.set_group(ctx.env.PLATFORM_NAME)
        app_elf = '{}/pebble-app.elf'.format(ctx.env.BUILD_DIR)
        ctx.pbl_build(source=ctx.path.ant_glob('src/c/**/*.c'), target=app_elf, bin_type='app')

        if build_worker:
            worker_elf = '{}/pebble-worker.elf'.format(ctx.env.BUILD_DIR)
            binaries.append({'platform': platform, 'app_elf': app_elf, 'worker_elf': worker_elf})
            ctx.pbl_build(source=ctx.path.ant_glob('worker_src/c/**/*.c'),
                          target=worker_elf,
                          bin_type='worker')
        else:
            binaries.append({'platform': platform, 'app_elf': app_elf})
    ctx.env = cached_env

    ctx.set_group('bundle')
    ctx.pbl_bundle(binaries=binaries,
                   js=ctx.path.ant_glob(['src/pkjs/**/*.js',
                                         'src/pkjs/**/*.json',
                                         'src/common/**/*.js']),
                   js_entry_file='src/pkjs/index.js')
