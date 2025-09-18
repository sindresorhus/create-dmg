import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import test from 'ava';
import {execa} from 'execa';
import {temporaryDirectory} from 'tempy';
import jestImageSnapshot from 'jest-image-snapshot';
import { spawnSync } from 'node:child_process';
const { configureToMatchImageSnapshot } = jestImageSnapshot;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Validate that the icon for the DMG matches the snapshot (with a small tolerance to avoid flakiness) */
const assertVolumeIconMatchesSnapshot = (t, dmgPath) => {
	// Mount the DMG and extract the volume icon
	const existingVolumes = new Set(fs.readdirSync('/Volumes'));
	spawnSync('hdiutil', ['mount', dmgPath]);
	const volumes = new Set(fs.readdirSync('/Volumes'));
	const mountLocation = [...volumes].find(x => !existingVolumes.has(x));
	t.truthy(mountLocation);
	const dmgIconPath = path.join('/Volumes', mountLocation, '.VolumeIcon.icns')
	const dirPath = path.dirname(dmgPath);
	const iconPath = path.join(dirPath, 'VolumeIcon.icns');
	fs.copyFileSync(dmgIconPath, iconPath);
	spawnSync('hdiutil', ['unmount', path.join('/Volumes', mountLocation)]);
	const pngPath = path.join(dirPath, 'VolumeIcon.png');
	spawnSync('sips', ['-s', 'format', 'png', iconPath, '--out', pngPath]);

	// Compare the extracted icon to the snapshot
	const image = fs.readFileSync(pngPath);

	// Create a Jest-like context for jest-image-snapshot
	const jestContext = {
		testPath: fileURLToPath(import.meta.url),
		currentTestName: t.title,
		_counters: new Map(),
		snapshotState: {
			_counters: new Map(),
			_updateSnapshot: process.env.UPDATE_SNAPSHOT === 'true' ? 'all' : 'new',
			updated: 0,
			added: 0
		}
	};

	const result = configureToMatchImageSnapshot({
	failureThreshold: 0.01,
	failureThresholdType: 'percent',
	}).call(jestContext, image)

	if (result.pass) {
		t.pass();
	} else {
		t.fail(result.message());
	}
}

test('main', async t => {
	const cwd = temporaryDirectory();

	try {
		await execa(path.join(__dirname, 'cli.js'), ['--identity=0', path.join(__dirname, 'fixtures/Fixture.app')], {cwd});
	} catch (error) {
		// Silence code signing failure
		if (!error.message.includes('No suitable code signing')) {
			throw error;
		}
	}
	const dmgPath = path.join(cwd, 'Fixture 0.0.1.dmg');
	t.true(fs.existsSync(dmgPath));

	assertVolumeIconMatchesSnapshot(t, dmgPath);
});

test('binary plist', async t => {
	const cwd = temporaryDirectory();

	try {
		await execa(path.join(__dirname, 'cli.js'), ['--identity=0', path.join(__dirname, 'fixtures/Fixture-with-binary-plist.app')], {cwd});
	} catch (error) {
		// Silence code signing failure
		if (!error.message.includes('No suitable code signing')) {
			throw error;
		}
	}

	const dmgPath = path.join(cwd, 'Fixture 0.0.1.dmg');
	t.true(fs.existsSync(dmgPath));
	assertVolumeIconMatchesSnapshot(t, dmgPath);
});

test('app without icon', async t => {
	const cwd = temporaryDirectory();

	try {
		await execa(path.join(__dirname, 'cli.js'), ['--identity=0', path.join(__dirname, 'fixtures/Fixture-no-icon.app')], {cwd});
	} catch (error) {
		// Silence code signing failure
		if (!error.message.includes('No suitable code signing')) {
			throw error;
		}
	}

	t.true(fs.existsSync(path.join(cwd, 'Fixture 0.0.1.dmg')));
});
