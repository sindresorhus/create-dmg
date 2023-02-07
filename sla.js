import {Buffer} from 'node:buffer';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execa} from 'execa';
import {temporaryFile} from 'tempy';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getRtfUnicodeEscapedString(text) {
	let result = '';
	for (let index = 0; index < text.length; index++) {
		if (text[index] === '\\' || text[index] === '{' || text[index] === '}' || text[index] === '\n') {
			result += `\\${text[index]}`;
		} else if (text[index] === '\r') {
			// ignore
		} else if (text.codePointAt(index) <= 0x7F) {
			result += text[index];
		} else {
			result += `\\u${text.codePointAt(index)}?`;
		}
	}

	return result;
}

function wrapInRtf(text) {
	return '\t$"7B5C 7274 6631 5C61 6E73 695C 616E 7369"\n'
		+ '\t$"6370 6731 3235 325C 636F 636F 6172 7466"\n'
		+ '\t$"3135 3034 5C63 6F63 6F61 7375 6272 7466"\n'
		+ '\t$"3833 300A 7B5C 666F 6E74 7462 6C5C 6630"\n'
		+ '\t$"5C66 7377 6973 735C 6663 6861 7273 6574"\n'
		+ '\t$"3020 4865 6C76 6574 6963 613B 7D0A 7B5C"\n'
		+ '\t$"636F 6C6F 7274 626C 3B5C 7265 6432 3535"\n'
		+ '\t$"5C67 7265 656E 3235 355C 626C 7565 3235"\n'
		+ '\t$"353B 7D0A 7B5C 2A5C 6578 7061 6E64 6564"\n'
		+ '\t$"636F 6C6F 7274 626C 3B3B 7D0A 5C70 6172"\n'
		+ '\t$"645C 7478 3536 305C 7478 3131 3230 5C74"\n'
		+ '\t$"7831 3638 305C 7478 3232 3430 5C74 7832"\n'
		+ '\t$"3830 305C 7478 3333 3630 5C74 7833 3932"\n'
		+ '\t$"305C 7478 3434 3830 5C74 7835 3034 305C"\n'
		+ '\t$"7478 3536 3030 5C74 7836 3136 305C 7478"\n'
		+ '\t$"616C 5C70 6172 7469 6768 7465 6E66 6163"\n'
		+ '\t$"746F 7230 0A0A 5C66 305C 6673 3234 205C"\n'
		+ `${serializeString('63663020' + Buffer.from(getRtfUnicodeEscapedString(text)).toString('hex').toUpperCase() + '7D')}`;
}

function serializeString(text) {
	return '\t$"' + text.match(/.{1,32}/g).map(x => x.match(/.{1,4}/g).join(' ')).join('"\n\t$"') + '"';
}

export default async function sla(dmgPath, dmgFormat) {
	// Valid SLA filenames
	const rawSlaFile = path.join(process.cwd(), 'sla.r');
	const rtfSlaFile = path.join(process.cwd(), 'license.rtf');
	const txtSlaFile = path.join(process.cwd(), 'license.txt');

	const hasRaw = fs.existsSync(rawSlaFile);
	const hasRtf = fs.existsSync(rtfSlaFile);
	const hasTxt = fs.existsSync(txtSlaFile);

	if (!hasRaw && !hasRtf && !hasTxt) {
		return;
	}

	const temporaryDmgPath = temporaryFile({extension: 'dmg'});

	// UDCO or UDRO format is required to be able to unflatten
	// Convert and unflatten DMG (original format will be restored at the end)
	await execa('/usr/bin/hdiutil', ['convert', '-format', 'UDCO', dmgPath, '-o', temporaryDmgPath]);
	await execa('/usr/bin/hdiutil', ['unflatten', temporaryDmgPath]);

	if (hasRaw) {
		// If user-defined sla.r file exists, add it to dmg with 'rez' utility
		await execa('/usr/bin/rez', ['-a', rawSlaFile, '-o', temporaryDmgPath]);
	} else {
		// Generate sla.r file from text/rtf file
		// Use base.r file as a starting point
		let data = fs.readFileSync(path.join(__dirname, 'base.r'), 'utf8');
		let plainText = '';

		// Generate RTF version and preserve plain text
		data += '\ndata \'RTF \' (5000, "English") {\n';

		if (hasRtf) {
			data += serializeString((fs.readFileSync(rtfSlaFile).toString('hex').toUpperCase()));
			({stdout: plainText} = await execa('/usr/bin/textutil', ['-convert', 'txt', '-stdout', rtfSlaFile]));
		} else {
			plainText = fs.readFileSync(txtSlaFile, 'utf8');
			data += wrapInRtf(plainText);
		}

		data += '\n};\n';

		// Generate plain text version
		// Used as an alternate for command-line deployments
		data += '\ndata \'TEXT\' (5000, "English") {\n';
		data += serializeString(Buffer.from(plainText, 'utf8').toString('hex').toUpperCase());
		data += '\n};\n';

		// Save sla.r file, add it to DMG with `rez` utility
		const temporarySlaFile = temporaryFile({extension: 'r'});
		fs.writeFileSync(temporarySlaFile, data, 'utf8');
		await execa('/usr/bin/rez', ['-a', temporarySlaFile, '-o', temporaryDmgPath]);
	}

	// Flatten and convert back to original dmgFormat
	await execa('/usr/bin/hdiutil', ['flatten', temporaryDmgPath]);
	await execa('/usr/bin/hdiutil', ['convert', '-format', dmgFormat, temporaryDmgPath, '-o', dmgPath, '-ov']);
}
