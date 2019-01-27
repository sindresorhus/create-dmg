const fs = require('fs');
const childProcess = require('child_process');
const util = require('util');
const tempy = require('tempy');
const gm = require('gm').subClass({imageMagick: true});
const icns = require('icns-lib');

const filterMap = (map, filterFn) => Object.entries(map).filter(filterFn).reduce((out, [key, item]) => ({...out, [key]: item}), {});
const baseDiskIconPath = '/System/Library/Extensions/IOStorageFamily.kext/Contents/Resources/Removable.icns';

async function composeIcon(type, appIcon, mountIcon, composedIcon) {
	mountIcon = gm(mountIcon);
	appIcon = gm(appIcon);
	const appIconSize = await util.promisify(appIcon.size).call(appIcon);
	const mountIconSize = await util.promisify(appIcon.size).call(appIcon);

	// Change the perspective of the app icon to match the mount drive icon
	appIcon = appIcon.out('-matte').out('-virtual-pixel', 'transparent').out('-distort', 'Perspective', `1,1  ${appIconSize.width * 0.08},1     ${appIconSize.width},1  ${appIconSize.width * 0.92},1     1,${appIconSize.height}  1,${appIconSize.height}     ${appIconSize.width},${appIconSize.height}  ${appIconSize.width},${appIconSize.height}`);
	// Resize the app icon to fit it inside the mount icon, aspect ration should not be kept to create the perspective illution
	appIcon = appIcon.resize(appIconSize.width / 1.7, appIconSize.height / 1.78, '!');

	const tempAppIconPath = tempy.file({extension: 'png'});
	await util.promisify(appIcon.write).call(appIcon, tempAppIconPath);
	// Compose the two icons
	mountIcon = mountIcon.composite(tempAppIconPath).gravity('Center').geometry('+0-' + (mountIconSize.height * 0.155));

	composedIcon[type] = await util.promisify(mountIcon.toBuffer).call(mountIcon);
}

const hasGm = () => {
	const result = childProcess.spawnSync('gm', ['-version']);
	if (!result.error) {
		return true;
	}
	if (result.error.message.includes('gm ENOENT')) {
		return false;
	}
	throw result.error;
};

module.exports = async function (appIconPath) {
	if (hasGm()) {
		const baseDiskIcons = filterMap(icns.parse(fs.readFileSync(baseDiskIconPath)), ([key]) => icns.isImageType(key));
		const appIcon = filterMap(icns.parse(fs.readFileSync(appIconPath)), ([key]) => icns.isImageType(key));

		const composedIcon = {};
		await Promise.all(Object.entries(appIcon).map(async ([type, icon]) => {
			if (baseDiskIcons[type]) {
				return composeIcon(type, icon, baseDiskIcons[type], composedIcon);
			}
			console.warn('there is no base image for this type', type);
		}));
		const tempoComposedIcon = tempy.file({extension: 'icns'});
		fs.writeFileSync(tempoComposedIcon, icns.format(composedIcon));
		return tempoComposedIcon;
	}
	return baseDiskIconPath;
};
