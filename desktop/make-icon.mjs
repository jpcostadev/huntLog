import fs from 'node:fs/promises';
import pngToIco from 'png-to-ico';

const icon = await pngToIco('assets/huntlog-icon.png');
await fs.writeFile('desktop/huntlog.ico', icon);
