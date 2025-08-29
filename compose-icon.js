import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execa} from 'execa';
import {temporaryFile} from 'tempy';
import icns from 'icns-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const filterMap = (map, filterFunction) => Object.fromEntries(Object.entries(map).filter(element => filterFunction(element)).map(([key, item]) => [key, item]));

// Drive icon from `/System/Library/Extensions/IOStorageFamily.kext/Contents/Resources/Removable.icns``
const baseDiskIconPath = `${__dirname}/disk-icon.icns`;

const biggestPossibleIconType = 'ic10';

async function baseComposeIcon(type, appIcon, mountIcon, composedIcon) {
	// Write app and mount icons to temporary PNG files
	const temporaryAppIconPath = temporaryFile({extension: 'png'});
	const temporaryMountIconPath = temporaryFile({extension: 'png'});
	const temporaryOutputPath = temporaryFile({extension: 'png'});

	await writeFile(temporaryAppIconPath, appIcon);
	await writeFile(temporaryMountIconPath, mountIcon);

	// Use Swift executable for image processing
	const swiftExecutablePath = path.join(__dirname, 'compose-icon');
	
	try {
		await execa(swiftExecutablePath, [
			temporaryAppIconPath,
			temporaryMountIconPath,
			temporaryOutputPath
		]);

		// Read the composed image back
		composedIcon[type] = await readFile(temporaryOutputPath);
	} catch (error) {
		throw new Error(`Swift image processing failed: ${error.message}`);
	}
}

const hasSwiftExecutable = async () => {
	const swiftExecutablePath = path.join(__dirname, 'compose-icon');
	try {
		await fs.promises.access(swiftExecutablePath, fs.constants.F_OK | fs.constants.X_OK);
		return true;
	} catch (error) {
		return false;
	}
};

export default async function composeIcon(appIconPath) {
	if (!await hasSwiftExecutable()) {
		return baseDiskIconPath;
	}

	const baseDiskIcons = filterMap(icns.parse(await readFile(baseDiskIconPath)), ([key]) => icns.isImageType(key));
	const appIcon = filterMap(icns.parse(await readFile(appIconPath)), ([key]) => icns.isImageType(key));

	const composedIcon = {};
	await Promise.all(Object.entries(appIcon).map(async ([type, icon]) => {
		if (baseDiskIcons[type]) {
			return baseComposeIcon(type, icon, baseDiskIcons[type], composedIcon);
		}

		console.warn('There is no base image for this type', type);
	}));

	if (!composedIcon[biggestPossibleIconType]) {
		// Make sure the highest-resolution variant is generated
		const largestAppIcon = Object.values(appIcon).sort((a, b) => Buffer.byteLength(b) - Buffer.byteLength(a))[0];
		await baseComposeIcon(biggestPossibleIconType, largestAppIcon, baseDiskIcons[biggestPossibleIconType], composedIcon);
	}

	const temporaryComposedIcon = temporaryFile({extension: 'icns'});

	await writeFile(temporaryComposedIcon, icns.format(composedIcon));

	return temporaryComposedIcon;
}
