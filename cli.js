#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const meow = require('meow');
const appdmg = require('appdmg');
const plist = require('plist');
const Ora = require('ora');
const execa = require('execa');

if (process.platform !== 'darwin') {
	console.error('macOS only');
	process.exit(1);
}

const cli = meow(`
	Usage
	  $ create-dmg <app> [destination]

	Options
	  --overwrite  Overwrite existing DMG with the same name

	Examples
	  $ create-dmg 'Lungo.app'
	  $ create-dmg 'Lungo.app' Build/Releases
`, {
	flags: {
		overwrite: {
			type: 'boolean'
		}
	}
});

let [appPath, destPath] = cli.input;

if (!appPath) {
	console.error('Specify an app');
	process.exit(1);
}

if (!destPath) {
	destPath = process.cwd();
}

let infoPlist;
try {
	infoPlist = fs.readFileSync(path.join(appPath, 'Contents/Info.plist'), 'utf8');
} catch (error) {
	if (error.code === 'ENOENT') {
		console.error(`Could not find \`${path.relative(process.cwd(), appPath)}\``);
		process.exit(1);
	}

	throw error;
}

const appInfo = plist.parse(infoPlist);
const appName = appInfo.CFBundleDisplayName || appInfo.CFBundleName;
// `const appIconName = appInfo.CFBundleIconFile.replace(/\.icns/, '');
const dmgPath = path.join(destPath, `${appName} ${appInfo.CFBundleShortVersionString}.dmg`);

const ora = new Ora('Creating DMG');
ora.start();

if (cli.flags.overwrite) {
	try {
		fs.unlinkSync(dmgPath);
	} catch (_) {}
}

const ee = appdmg({
	target: dmgPath,
	basepath: process.cwd(),
	specification: {
		title: appName,
		// Disabled because of #16
		// icon: path.join(appPath, 'Contents/Resources', `${appIconName}.icns`),
		//
		// Use transparent background and `background-color` option when this is fixed:
		// https://github.com/LinusU/node-appdmg/issues/135
		background: path.join(__dirname, 'assets/dmg-background.png'),
		'icon-size': 160,
		format: 'ULFO',
		window: {
			size: {
				width: 660,
				height: 400
			}
		},
		contents: [
			{
				x: 180,
				y: 170,
				type: 'file',
				path: appPath
			},
			{
				x: 480,
				y: 170,
				type: 'link',
				path: '/Applications'
			}
		]
	}
});

ee.on('progress', info => {
	if (info.type === 'step-begin') {
		ora.text = info.title;
	}
});

ee.on('finish', async () => {
	ora.text = 'Code signing DMG';

	try {
		let identity;
		const {stdout} = await execa('security', ['find-identity', '-v', '-p', 'codesigning']);
		if (stdout.includes('Developer ID Application:')) {
			identity = 'Developer ID Application';
		} else if (stdout.includes('Mac Developer:')) {
			identity = 'Mac Developer';
		} else {
			const err = new Error();
			err.stderr = 'No usable identity found';
			throw err;
		}

		await execa('codesign', ['--sign', identity, dmgPath]);
		const {stderr} = await execa('codesign', [dmgPath, '--display', '--verbose=2']);

		const match = /^Authority=(.*)$/m.exec(stderr);
		if (!match) {
			ora.fail('Not code signed');
			process.exit(1);
		}

		ora.info(`Code signing identity: ${match[1]}`).start();
		ora.succeed('DMG created');
	} catch (error) {
		ora.fail(`Code signing failed. The DMG is fine, just not code signed.\n${error.stderr.trim()}`);
		process.exit(1);
	}
});

ee.on('error', error => {
	ora.fail(error);
	process.exit(1);
});
