import path from 'path';
import fs from 'fs';
import test from 'ava';
import execa from 'execa';
import tempfile from 'tempfile';

test(async t => {
	const cwd = tempfile();
	fs.mkdirSync(cwd);
	await t.throws(execa(path.join(__dirname, 'cli.js'), [path.join(__dirname, 'fixture.app')], {cwd}), /Code signing failed/);
	t.true(fs.existsSync(path.join(cwd, 'fixture-0.0.1.dmg')));
});
