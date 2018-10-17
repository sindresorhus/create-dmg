import path from 'path';
import fs from 'fs';
import test from 'ava';
import execa from 'execa';
import tempy from 'tempy';

test('main', async t => {
	const cwd = tempy.directory();

	try {
		await execa(path.join(__dirname, 'cli.js'), [path.join(__dirname, 'fixture.app')], {cwd});
	} catch (error) {
		// Silence code signing failure
		if (!/Code signing failed/.test(error.message)) {
			throw error;
		}
	}

	t.true(fs.existsSync(path.join(cwd, 'Fixture 0.0.1.dmg')));
});
