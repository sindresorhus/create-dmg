import {Buffer} from 'node:buffer';
import fs from 'node:fs';
import {promisify} from 'node:util';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execa} from 'execa';
import {temporaryFile} from 'tempy';
import baseGm from 'gm';
import icns from 'icns-lib';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const gm = baseGm.subClass({imageMagick: true});
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const filterMap = (map, filterFunction) => Object.fromEntries(Object.entries(map).filter(element => filterFunction(element)).map(([key, item]) => [key, item]));

// Drive icon from `/System/Library/Extensions/IOStorageFamily.kext/Contents/Resources/Removable.icns``
const baseDiskIconPath = `${__dirname}/disk-icon.icns`;

const biggestPossibleIconType = 'ic10';

async function baseComposeIcon(type, appIcon, mountIcon, composedIcon) {
	mountIcon = gm(mountIcon);
	appIcon = gm(appIcon);

	const [appIconSize, mountIconSize] = await Promise.all([
		promisify(appIcon.size.bind(appIcon))(),
		promisify(appIcon.size.bind(mountIcon))(),
	]);

	// Change the perspective of the app icon to match the mount drive icon
	appIcon = appIcon.out('-matte').out('-virtual-pixel', 'transparent').out('-distort', 'Perspective', `1,1  ${appIconSize.width * 0.08},1     ${appIconSize.width},1  ${appIconSize.width * 0.92},1     1,${appIconSize.height}  1,${appIconSize.height}     ${appIconSize.width},${appIconSize.height}  ${appIconSize.width},${appIconSize.height}`);

	// Resize the app icon to fit it inside the mount icon, aspect ration should not be kept to create the perspective illution
	appIcon = appIcon.resize(mountIconSize.width / 1.58, mountIconSize.height / 1.82, '!');

	const temporaryAppIconPath = temporaryFile({extension: 'png'});
	await promisify(appIcon.write.bind(appIcon))(temporaryAppIconPath);

	// Compose the two icons
	const iconGravityFactor = mountIconSize.height * 0.063;
	mountIcon = mountIcon.composite(temporaryAppIconPath).gravity('Center').geometry(`+0-${iconGravityFactor}`);

	composedIcon[type] = await promisify(mountIcon.toBuffer.bind(mountIcon))();
}

const hasGm = async () => {
	try {
		await execa('gm', ['-version']);
		return true;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return false;
		}

		throw error;
	}
};

export default async function composeIcon(appIconPath) {
	if (!await hasGm()) {
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
