#!/usr/bin/env node
'use strict';
const path = require('path');
const fs = require('fs');
const meow = require('meow');
const appdmg = require('appdmg');
const plist = require('plist');
const Ora = require('ora');
const execa = require('execa');
const tempy = require('tempy');
const composeIcon = require('./compose-icon');

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
	  --dmg-title=<value>  Manually set title of DMG volume (only used if app name is >27 character limit)

	Examples
	  $ create-dmg 'Lungo.app'
	  $ create-dmg 'Lungo.app' Build/Releases
`, {
	flags: {
		overwrite: {
			type: 'boolean'
		},
		identity: {
			type: 'string'
		},
		dmgTitle: {
			type: 'string'
		}
	}
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

let dmgFormat;
// List valid SLA filenames
const rawSlaFile = path.join(process.cwd(), 'sla.r');
const rtfSlaFile = path.join(process.cwd(), 'license.rtf');
const txtSlaFile = path.join(process.cwd(), 'license.txt');

const ora = new Ora('Creating DMG');
ora.start();

async function init() {
	let appInfo;
	try {
		appInfo = plist.parse(infoPlist);
	} catch (_) {
		const {stdout} = await execa('/usr/bin/plutil', ['-convert', 'xml1', '-o', '-', infoPlistPath]);
		appInfo = plist.parse(stdout);
	}

	const appName = appInfo.CFBundleDisplayName || appInfo.CFBundleName;
	const appIconName = appInfo.CFBundleIconFile.replace(/\.icns/, '');
	const dmgTitle = appName.length > 27 ? (cli.flags['dmg-title'] || appName) : appName;
	const dmgPath = path.join(destinationPath, `${appName} ${appInfo.CFBundleShortVersionString}.dmg`);

	if (cli.flags.overwrite) {
		try {
			fs.unlinkSync(dmgPath);
		} catch (_) {}
	}

	ora.text = 'Creating icon';
	const composedIconPath = await composeIcon(path.join(appPath, 'Contents/Resources', `${appIconName}.icns`));

	ora.text = 'Checking minimum runtime';
	const {stdout: minSystemVersion} = await execa('/usr/libexec/PlistBuddy', ['-c', 'Print :LSMinimumSystemVersion', infoPlistPath]);
	const minorVersion = Number(minSystemVersion.replace('10.', '')) || 0;
	dmgFormat = (minorVersion >= 11) ? 'ULFO' : 'UDZO'; // ULFO requires 10.11+
	ora.info(`Minimum runtime ${minSystemVersion} detected, using ${dmgFormat} format`).start();

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
		try {
			const hasRaw = fs.existsSync(rawSlaFile);
			const hasRtf = fs.existsSync(rtfSlaFile);
			const hasTxt = fs.existsSync(txtSlaFile);

			if (hasRaw || hasRtf || hasTxt) {
				ora.text = 'Adding Software License Agreement';

				const tempDmgPath = tempy.file({extension: 'dmg'});
				// UDCO or UDRO format is required for SLA
				await execa('/usr/bin/hdiutil', ['convert', '-format', 'UDCO', dmgPath, '-o', tempDmgPath]);
				await execa('/usr/bin/hdiutil', ['unflatten', tempDmgPath]);

				if (hasRaw) {
					await execa('/usr/bin/rez', ['-a', rawSlaFile, '-o', tempDmgPath]);
				} else {
					let data = fs.readFileSync(path.join(__dirname, 'base.r'), 'utf8');
					let plainText = '';

					data += '\ndata \'RTF \' (5000, "English") {\n';

					if (hasRtf) {
						data += serializeString((Buffer.from(fs.readFileSync(rtfSlaFile, 'utf8')).toString('hex').toUpperCase()));
						({stdout: plainText} = await execa('/usr/bin/textutil', ['-convert', 'txt', '-stdout', rtfSlaFile]));
					} else {
						plainText = fs.readFileSync(txtSlaFile, 'utf8');
						data += wrapInRtf(plainText);
					}

					data += '\n};\n';

					data += '\ndata \'TEXT\' (5000, "English") {\n';
					data += serializeString(Buffer.from(plainText, 'utf8').toString('hex').toUpperCase());
					data += '\n};\n';

					const tempSlaFile = tempy.file({extension: 'r'});

					fs.writeFileSync(tempSlaFile, data, 'utf8');
					await execa('/usr/bin/rez', ['-a', tempSlaFile, '-o', tempDmgPath]);
				}

				await execa('/usr/bin/hdiutil', ['flatten', tempDmgPath]);
				await execa('/usr/bin/hdiutil', ['convert', '-format', dmgFormat, tempDmgPath, '-o', dmgPath, '-ov']);
			}

			ora.text = 'Replacing DMG icon';
			// `seticon`` is a native tool to change files icons (Source: https://github.com/sveinbjornt/osxiconutils)
			await execa(path.join(__dirname, 'seticon'), [composedIconPath, dmgPath]);

			ora.text = 'Code signing DMG';
			let identity;
			const {stdout} = await execa('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning']);
			if (cli.flags.identity && stdout.includes(`"${cli.flags.identity}"`)) {
				identity = cli.flags.identity;
			} else if (!cli.flags.identity && stdout.includes('Developer ID Application:')) {
				identity = 'Developer ID Application';
			} else if (!cli.flags.identity && stdout.includes('Mac Developer:')) {
				identity = 'Mac Developer';
			}

			if (!identity) {
				const error = new Error();
				error.stderr = 'No suitable code signing identity found';
				throw error;
			}

			await execa('/usr/bin/codesign', ['--sign', identity, dmgPath]);
			const {stderr} = await execa('/usr/bin/codesign', [dmgPath, '--display', '--verbose=2']);

			const match = /^Authority=(.*)$/m.exec(stderr);
			if (!match) {
				ora.fail('Not code signed');
				process.exit(1);
			}

			ora.info(`Code signing identity: ${match[1]}`).start();
			ora.succeed('DMG created');
		} catch (error) {
			ora.fail(`Code signing failed. The DMG is fine, just not code signed.\n${Object.prototype.hasOwnProperty.call(error, 'stderr') ? error.stderr.trim() : error}`);
			process.exit(2);
		}
	});

	ee.on('error', error => {
		ora.fail(`Building the DMG failed. ${error}`);
		process.exit(1);
	});
}

init().catch(error => {
	ora.fail(error);
	process.exit(1);
});

//
// Adapted from:
// https://github.com/electron-userland/electron-builder/tree/master/packages/dmg-builder/src

function getRtfUnicodeEscapedString(text) {
	let result = '';
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '\\' || text[i] === '{' || text[i] === '}' || text[i] === '\n') {
			result += `\\${text[i]}`;
		} else if (text[i] === '\r') {
			// ignore
		} else if (text.charCodeAt(i) <= 0x7F) {
			result += text[i];
		} else {
			result += `\\u${text.codePointAt(i)}?`;
		}
	}

	return result;
}

function wrapInRtf(text) {
	return '\t$"7B5C 7274 6631 5C61 6E73 695C 616E 7369"\n' +
		'\t$"6370 6731 3235 325C 636F 636F 6172 7466"\n' +
		'\t$"3135 3034 5C63 6F63 6F61 7375 6272 7466"\n' +
		'\t$"3833 300A 7B5C 666F 6E74 7462 6C5C 6630"\n' +
		'\t$"5C66 7377 6973 735C 6663 6861 7273 6574"\n' +
		'\t$"3020 4865 6C76 6574 6963 613B 7D0A 7B5C"\n' +
		'\t$"636F 6C6F 7274 626C 3B5C 7265 6432 3535"\n' +
		'\t$"5C67 7265 656E 3235 355C 626C 7565 3235"\n' +
		'\t$"353B 7D0A 7B5C 2A5C 6578 7061 6E64 6564"\n' +
		'\t$"636F 6C6F 7274 626C 3B3B 7D0A 5C70 6172"\n' +
		'\t$"645C 7478 3536 305C 7478 3131 3230 5C74"\n' +
		'\t$"7831 3638 305C 7478 3232 3430 5C74 7832"\n' +
		'\t$"3830 305C 7478 3333 3630 5C74 7833 3932"\n' +
		'\t$"305C 7478 3434 3830 5C74 7835 3034 305C"\n' +
		'\t$"7478 3536 3030 5C74 7836 3136 305C 7478"\n' +
		'\t$"616C 5C70 6172 7469 6768 7465 6E66 6163"\n' +
		'\t$"746F 7230 0A0A 5C66 305C 6673 3234 205C"\n' +
		`${serializeString('63663020' + Buffer.from(getRtfUnicodeEscapedString(text)).toString('hex').toUpperCase() + '7D')}`;
}

function serializeString(text) {
	return '\t$"' + text.match(/.{1,32}/g).map(it => it.match(/.{1,4}/g).join(' ')).join('"\n\t$"') + '"';
}
