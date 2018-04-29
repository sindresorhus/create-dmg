#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const meow = require('meow');
const appdmg = require('appdmg');
const plist = require('plist');
const Ora = require('ora');
const execa = require('execa');

const cli = meow(`
	Usage:
	  $ create-dmg <app> [destination]
	
	Examples:
	  $ create-dmg 'Lungo.app'
	  $ create-dmg 'Lungo.app' Build/Releases/
`);

if (process.platform !== 'darwin') {
	console.error('macOS only');
	process.exit(1);
}

if (cli.input.length === 0) {
	console.error('Specify an app');
	process.exit(1);
}

const appPath = path.resolve(cli.input[0]);

let destPath = '.';
if (cli.input.length > 1) {
	destPath = path.resolve(cli.input[1]);
}

let infoPlist;
try {
	infoPlist = fs.readFileSync(path.join(appPath, 'Contents/Info.plist'), 'utf8');
} catch (err) {
	if (err.code === 'ENOENT') {
		console.error(`Could not find "${path.relative(process.cwd(), appPath)}"`);
		process.exit(1);
	}

	throw err;
}

const appInfo = plist.parse(infoPlist);
const appName = appInfo.CFBundleName;
// `const appIconName = appInfo.CFBundleIconFile.replace(/\.icns/, '');
const dmgPath = `${appName.replace(/ /g, '-')}-${appInfo.CFBundleShortVersionString}.dmg`;

const ora = new Ora('Creating DMG');
ora.start();

const ee = appdmg({
	target: dmgPath,
	basepath: __dirname,
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

ee.on('finish', () => {
	ora.text = 'Code signing DMG';

	execa('codesign', ['--sign', 'Developer ID Application', dmgPath]).then(() => {
		return execa.stderr('codesign', [dmgPath, '--display', '--verbose=2']);
	}).then(stderr => {
		const match = /^Authority=(.*)$/m.exec(stderr);

		if (!match) {
			ora.fail('Not code signed');
			process.exit(1);
		}

		ora.info(`Code signing identity: ${match[1]}`).start();
		ora.succeed('DMG created');
	}).catch(err => {
		ora.fail(`Code signing failed. The DMG is fine, just not code signed.\n${err.stderr.trim()}`);
		process.exit(1);
	});
});

ee.on('error', err => {
	ora.fail(err);
	process.exit(1);
});
