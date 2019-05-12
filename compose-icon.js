const fs = require('fs');
const {promisify} = require('util');
const execa = require('execa');
const tempy = require('tempy');
const gm = require('gm').subClass({imageMagick: true});
const icns = require('icns-lib');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const filterMap = (map, filterFn) => Object.entries(map).filter(filterFn).reduce((out, [key, item]) => ({...out, [key]: item}), {});

// Drive icon from `/System/Library/Extensions/IOStorageFamily.kext/Contents/Resources/Removable.icns``
const baseDiskIconPath = `${__dirname}/disk-icon.icns`;

async function composeIcon(type, appIcon, mountIcon, composedIcon) {
	mountIcon = gm(mountIcon);
	appIcon = gm(appIcon);
	const appIconSize = await promisify(appIcon.size.bind(appIcon))();
	const mountIconSize = appIconSize;

	// Change the perspective of the app icon to match the mount drive icon
	appIcon = appIcon.out('-matte').out('-virtual-pixel', 'transparent').out('-distort', 'Perspective', `1,1  ${appIconSize.width * 0.08},1     ${appIconSize.width},1  ${appIconSize.width * 0.92},1     1,${appIconSize.height}  1,${appIconSize.height}     ${appIconSize.width},${appIconSize.height}  ${appIconSize.width},${appIconSize.height}`);

	// Resize the app icon to fit it inside the mount icon, aspect ration should not be kept to create the perspective illution
	appIcon = appIcon.resize(appIconSize.width / 1.7, appIconSize.height / 1.78, '!');

	const tempAppIconPath = tempy.file({extension: 'png'});
	await promisify(appIcon.write.bind(appIcon))(tempAppIconPath);

	// Compose the two icons
	const iconGravityFactor = mountIconSize.height * 0.155;
	mountIcon = mountIcon.composite(tempAppIconPath).gravity('Center').geometry(`+0-${iconGravityFactor}`);

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

module.exports = async appIconPath => {
	if (!await hasGm()) {
		return baseDiskIconPath;
	}

	const baseDiskIcons = filterMap(icns.parse(await readFile(baseDiskIconPath)), ([key]) => icns.isImageType(key));
	const appIcon = filterMap(icns.parse(await readFile(appIconPath)), ([key]) => icns.isImageType(key));

	const composedIcon = {};
	await Promise.all(Object.entries(appIcon).map(async ([type, icon]) => {
		if (baseDiskIcons[type]) {
			return composeIcon(type, icon, baseDiskIcons[type], composedIcon);
		}

		console.warn('There is no base image for this type', type);
	}));

	const tempComposedIcon = tempy.file({extension: 'icns'});

	await writeFile(tempComposedIcon, icns.format(composedIcon));

	return tempComposedIcon;
};
