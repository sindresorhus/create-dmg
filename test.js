import path from 'path';
import fs from 'fs';
import test from 'ava';
import execa from 'execa';
import tempfile from 'tempfile';

test(async t => {
	const cwd = tempfile();
	fs.mkdirSync(cwd);

	try {
		await execa(path.join(__dirname, 'cli.js'), [path.join(__dirname, 'fixture.app')], {cwd});
	} catch (err) {
		// Silence code signing failure
		if (!/Code signing failed/.test(err.message)) {
			throw err;
		}
	}

	t.true(fs.existsSync(path.join(cwd, 'fixture-0.0.1.dmg')));
});

test('DMG format option', async t => {
	const cwd = tempfile();
	fs.mkdirSync(cwd);

	try {
		await execa(path.join(__dirname, 'cli.js'), ['-f', 'UDZO', path.join(__dirname, 'fixture.app')], {cwd});
	} catch (err) {
		// Silence code signing failure
		if (!/Code signing failed/.test(err.message)) {
			throw err;
		}
	}

	const fixture = path.join(cwd, 'fixture-0.0.1.dmg');
	const {stdout} = await execa('hdiutil', ['imageinfo', fixture], {cwd});
	t.true(stdout.includes('Format: UDZO'));
});
