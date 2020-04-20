import path from 'path';
import fs from 'fs';
import test from 'ava';
import execa from 'execa';
import tempy from 'tempy';

test('main', async t => {
	const cwd = tempy.directory();

	try {
		await execa(path.join(__dirname, 'cli.js'), [path.join(__dirname, 'fixtures/Fixture.app')], {cwd});
	} catch (error) {
		// Silence code signing failure
		if (!error.message.includes('Code signing failed')) {
			throw error;
		}
	}

	t.true(fs.existsSync(path.join(cwd, 'Fixture 0.0.1.dmg')));
});

test('binary plist', async t => {
	const cwd = tempy.directory();

	try {
		await execa(path.join(__dirname, 'cli.js'), [path.join(__dirname, 'fixtures/Fixture-with-binary-plist.app')], {cwd});
	} catch (error) {
		// Silence code signing failure
		if (!error.message.includes('Code signing failed')) {
			throw error;
		}
	}

	t.true(fs.existsSync(path.join(cwd, 'Fixture 0.0.1.dmg')));
});

test('app without icon', async t => {
	const cwd = tempy.directory();

	try {
		await execa(path.join(__dirname, 'cli.js'), [path.join(__dirname, 'fixtures/Fixture-no-icon.app')], {cwd});
	} catch (error) {
		// Silence code signing failure
		if (!error.message.includes('Code signing failed')) {
			throw error;
		}
	}

	t.true(fs.existsSync(path.join(cwd, 'Fixture 0.0.1.dmg')));
});
