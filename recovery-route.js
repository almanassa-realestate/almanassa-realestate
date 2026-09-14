'use strict';
// Older recovery emails can return to the site's home or admin URL.
// Forward the fragment to the dedicated page without logging or transmitting tokens elsewhere.
(()=>{const hash=new URLSearchParams(location.hash.slice(1));if(hash.get('type')==='recovery'||hash.has('error_code'))location.replace(new URL('recover.html',location.href).pathname+location.search+location.hash)})();
