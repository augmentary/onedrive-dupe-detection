import { createWriteStream } from 'fs';
import { readFile } from 'fs/promises';
import { stringify } from 'csv-stringify';
import { parse } from 'csv-parse/sync';

const conf = {
    infile: 'outab.csv',
    outfile: 'dupsab.csv',
    subsetOutFile: 'subsetsab.csv',
};

const columns = [
    'id',
    'filename',
    'sha1',
    'sha256',
    'created_date',
    'length',
    'path',
    'image_url'
];

function* getSubsets(set) {
    if(set.length === 0) {
        yield [];
    } else {
        const [el, ...rest] = set;
        for (const subset of getSubsets(rest)) {
            yield subset;
            yield [el, ...subset];
        }
    }
}

(async () => {
    const csv = await readFile(conf.infile);
    const data = parse(csv, {
        columns,
    });
    data.sort(function (r1, r2) { return r1.sha1 > r2.sha1 ? -1 : 1 });

    const folders = {};
    const files = {};
    for (const row of data) {
        if (row.filename !== 'ZbThumbnail.info') {
            const path = decodeURIComponent(row.path);
            const fname = decodeURIComponent(row.filename)
            folders[path] = folders[path] ?? [];
            folders[path].push([row.sha1, fname]);

            files[row.sha1] = files[row.sha1] ?? [];
            files[row.sha1].push([path, fname]);
        }
    }

    const shas = {};
    for (const [folder, fileShas] of Object.entries(folders)) {
        const catSha = fileShas.map(([sha, _]) => sha).join(',');
        shas[catSha] = shas[catSha] ?? [];
        shas[catSha].push(folder);
    }

    const dupes = Object.entries(shas).filter(([_, folders]) => folders.length > 1);

    const dupeFiles = Object.entries(files).filter(([_, files]) => files.length > 1);
    const subsets = {};
    for(const [_, files] of dupeFiles) {
        for(const [folder1,] of files) {
            const shasInFolder1 = folders[folder1].map(([sha,]) => sha);
            for(const [folder2,] of files) {
                if(folder1 === folder2) {
                    continue;
                }

                const shasInFolder2 = folders[folder2].map(([sha,]) => sha);
                if(shasInFolder1.length < shasInFolder2.length && shasInFolder1.filter(x => !shasInFolder2.includes(x)).length === 0) {
                    subsets[folder1] = subsets[folder1] ?? {};
                    subsets[folder1][folder2] = true;
                }
                else if(shasInFolder2.length < shasInFolder1.length && shasInFolder2.filter(x => !shasInFolder1.includes(x)).length === 0) {
                    subsets[folder2] = subsets[folder2] ?? {};
                    subsets[folder2][folder1] = true;
                }
            }
        }
    }

    const out = [];
    for (const [sha, folders] of dupes) {
        let short = sha.split(',').map((fileSha) => fileSha.substring(0, 5)).join(',');
        for (const folder of folders) {
            out.push([folder, folders.length, short])
        }
    }

    stringify(out, { header: false })
        .pipe(createWriteStream(conf.outfile))
        .on('finish', function () {
            console.log('Dupe CSV file written successfully');
        });

    const subsetOut = []
    for (const [subset, supersets] of Object.entries(subsets)) {
        for (const folder of Object.keys(supersets)) {
            subsetOut.push([subset, folder]);
        }
    }

    stringify(subsetOut, { header: false })
        .pipe(createWriteStream(conf.subsetOutFile))
        .on('finish', function () {
            console.log('Subset CSV file written successfully');
        });
})();
