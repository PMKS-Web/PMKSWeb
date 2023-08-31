// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  appVersion: require('../../package.json').version + '-dev',
  firebase: {
    apiKey: 'AIzaSyAXFfav2hbsikfFeUpVCH5dDfhJbAtNpds',
    authDomain: 'pmksplus-dev.firebaseapp.com',
    projectId: 'pmksplus-dev',
    storageBucket: 'pmksplus-dev.appspot.com',
    messagingSenderId: '544614835896',
    appId: '1:544614835896:web:e4ce898265bbcdca43b64d',
    measurementId: 'G-SQWWVNMK8Q',
  },
};

/*
 * For easier debugging in development mode, you can import the following file
 * to ignore zone related error stack frames such as `zone.run`, `zoneDelegate.invokeTask`.
 *
 * This import should be commented out in production mode because it will have a negative impact
 * on performance if an error is thrown.
 */
// import 'zone.js/plugins/zone-error';  // Included with Angular CLI.
