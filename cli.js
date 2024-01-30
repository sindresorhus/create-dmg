#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import meow from 'meow';
import appdmg from 'appdmg';
import plist from 'plist';
import Ora from 'ora';
import {execa} from 'execa';
import addLicenseAgreementIfNeeded from './sla.js';
import composeIcon from './compose-icon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (process.platform !== 'darwin') {
	console.error('macOS only');
	process.exit(1);
}

const cli = meow(`
	Usage
	  $ create-dmg <app> [destination]

	Options
	  --overwrite          Overwrite existing DMG with the same name
	  --identity=<value>   Manually set code signing identity (automatic by default)
	  --dmg-title=<value>  Manually set DMG title (must be <=27 characters) [default: App name]

	Examples
	  $ create-dmg 'Lungo.app'
	  $ create-dmg 'Lungo.app' Build/Releases
`, {
	importMeta: import.meta,
	flags: {
		overwrite: {
			type: 'boolean',
		},
		identity: {
			type: 'string',
		},
		dmgTitle: {
			type: 'string',
		},
	},
});

let [appPath, destinationPath] = cli.input;

if (!appPath) {
	console.error('Specify an app');
	process.exit(1);
}

if (!destinationPath) {
	destinationPath = process.cwd();
}

const infoPlistPath = path.join(appPath, 'Contents/Info.plist');

let infoPlist;
try {
	infoPlist = fs.readFileSync(infoPlistPath, 'utf8');
} catch (error) {
	if (error.code === 'ENOENT') {
		console.error(`Could not find \`${path.relative(process.cwd(), appPath)}\``);
		process.exit(1);
	}

	throw error;
}

const ora = new Ora('Creating DMG');
ora.start();

async function init() {
	let appInfo;
	try {
		appInfo = plist.parse(infoPlist);
	} catch {
		const {stdout} = await execa('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', infoPlistPath]);
		appInfo = plist.parse(stdout);
	}

	const appName = appInfo.CFBundleDisplayName ?? appInfo.CFBundleName;
	if (!appName) {
		throw new Error('The app must have `CFBundleDisplayName` or `CFBundleName` defined in its `Info.plist`.');
	}

	const dmgTitle = cli.flags.dmgTitle ?? appName;
	const dmgFilename = `${appName} ${appInfo.CFBundleShortVersionString}.dmg`;
	const dmgPath = path.join(destinationPath, dmgFilename);

	if (dmgTitle.length > 27) {
		ora.fail('The disk image title cannot exceed 27 characters. This is a limitation in a dependency: https://github.com/LinusU/node-alias/issues/7');
		process.exit(1);
	}

	if (cli.flags.overwrite) {
		try {
			fs.unlinkSync(dmgPath);
		} catch {}
	}

	const hasAppIcon = appInfo.CFBundleIconFile;
	let composedIconPath;
	if (hasAppIcon) {
		ora.text = 'Creating icon';
		const appIconName = appInfo.CFBundleIconFile.replace(/\.icns/, '');
		composedIconPath = await composeIcon(path.join(appPath, 'Contents/Resources', `${appIconName}.icns`));
	}

	const dmgFormat = 'ULFO'; // ULFO requires macOS 10.11+
	const dmgFilesystem = 'APFS'; // APFS requires macOS 10.13+

	const ee = appdmg({
		target: dmgPath,
		basepath: process.cwd(),
		specification: {
			title: dmgTitle,
			icon: composedIconPath,
			//
			// Use transparent background and `background-color` option when this is fixed:
			// https://github.com/LinusU/node-appdmg/issues/135
			background: path.join(__dirname, 'assets/dmg-background.png'),
			'icon-size': 160,
			format: dmgFormat,
			filesystem: dmgFilesystem,
			window: {
				size: {
					width: 660,
					height: 400,
				},
			},
			contents: [
				{
					x: 180,
					y: 170,
					type: 'file',
					path: appPath,
				},
				{
					x: 480,
					y: 170,
					type: 'link',
					path: '/Applications',
				},
			],
		},
	});

	ee.on('progress', info => {
		if (info.type === 'step-begin') {
			ora.text = info.title;
		}
	});

	ee.on('finish', async () => {
		try {
			ora.text = 'Adding Software License Agreement if needed';
			await addLicenseAgreementIfNeeded(dmgPath, dmgFormat);

			ora.text = 'Code signing DMG';
			let identity;
			const {stdout} = await execa('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
			if (cli.flags.identity && stdout.includes(`"${cli.flags.identity}"`)) {
				identity = cli.flags.identity;
			} else if (!cli.flags.identity && stdout.includes('Developer ID Application:')) {
				identity = 'Developer ID Application';
			} else if (!cli.flags.identity && stdout.includes('Mac Developer:')) {
				identity = 'Mac Developer';
			} else if (!cli.flags.identity && stdout.includes('Apple Development:')) {
				identity = 'Apple Development';
			}

			if (!identity) {
				const error = new Error(); // eslint-disable-line unicorn/error-message
				error.stderr = 'No suitable code signing identity found';
				throw error;
			}

			try {
				await execa('/usr/bin/codesign', ['--sign', identity, dmgPath]);
			} catch (error) {
				ora.fail(`Code signing failed. The DMG is fine, just not code signed.\n${error.stderr?.trim() ?? error}`);
				process.exit(2);
			}

			const {stderr} = await execa('/usr/bin/codesign', [dmgPath, '--display', '--verbose=2']);

			const match = /^Authority=(.*)$/m.exec(stderr);
			if (!match) {
				ora.fail('Not code signed');
				process.exit(1);
			}

			ora.info(`Code signing identity: ${match[1]}`).start();
			ora.succeed(`Created “${dmgFilename}”`);
		} catch (error) {
			ora.fail(`${error.stderr?.trim() ?? error}`);
			process.exit(2);
		}
	});

	ee.on('error', error => {
		ora.fail(`Building the DMG failed. ${error}`);
		process.exit(1);
	});
}

try {
	await init();
} catch (error) {
	ora.fail(error?.stack || error);
	process.exit(1);
}
