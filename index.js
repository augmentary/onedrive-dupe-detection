import { question } from 'readline-sync';
import appSettings from './appSettings.js';
import { existsSync, createWriteStream, } from 'fs';
import { readFile, writeFile, unlink } from 'fs/promises';
import { stringify } from 'csv-stringify';

async function getAuth() {
    const codeRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode', {
        method: 'POST',
        headers: {
            "Content-Type": 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(appSettings),
    });
    const codeJson = await codeRes.json();

    question(`To sign in, use a web browser to open the page https://www.microsoft.com/link and enter the code ${codeJson.user_code} to authenticate, then press enter to continue?`);
    const tokenRes = await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
            "Content-Type": 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            client_id: appSettings.client_id,
            device_code: codeJson.device_code,
        }),
    });
    const tokenJson = await tokenRes.json();

    writeFile('.auth', tokenJson.access_token);

    return tokenJson.access_token;
}

async function loadAuth() {
    if(existsSync('.auth')) {
        return await readFile('.auth');
    }

    return null;
}

async function getAuthHeaders() {
    const accessToken = await loadAuth() ?? await getAuth();
    return {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
    };
}

(async () => {
    let headers = await getAuthHeaders();

    let count = 0;
    let path = 'https://graph.microsoft.com/v1.0/drive/root:/Pictures/Saved Pictures:/delta';
    const files = [];
    while (path) {
        const folderRes = await fetch(path, { headers });
        const folderJson = await folderRes.json();

        if(folderJson?.error?.code === 'InvalidAuthenticationToken') {
            await unlink('.auth');
            console.log('Auth token has expired');
            headers = await getAuthHeaders();
            continue;
        }

        for (let f of folderJson.value) {
            if (f.file) {
                files.push([f.id, f.name, f.file.hashes.sha1Hash, f.file.hashes.sha256Hash, f.fileSystemInfo.createdDateTime, f.size, decodeURIComponent(f.parentReference.path.split(':')[1]), f['@microsoft.graph.downloadUrl'] ?? '']);
            }
        }

        path = folderJson['@odata.nextLink'];
        console.log(path);
        console.log(files.length);
        count += 1;
    }

    stringify(files, { header: false })
        .pipe(createWriteStream('out.csv'))
        .on('finish', function() {
            console.log('CSV file written successfully');
        });
})();