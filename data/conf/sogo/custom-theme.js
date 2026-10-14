/* RabbitTech Mail theme for SOGo (mounted as WebServerResources/js/theme.js).
 * Light, violet-accented palette matching the RabbitTech admin console.
 * Any error here falls back to SOGo's default theme instead of breaking the app.
 */
(function() {
  'use strict';
  angular.module('SOGo.Common')
    .config(configure);

  configure.$inject = ['$mdThemingProvider'];
  function configure($mdThemingProvider) {
    try {
      var rabbitViolet = $mdThemingProvider.extendPalette('deep-purple', {
        '50': 'F5F3FF',
        '100': 'EDE9FE',
        '200': 'DDD6FE',
        '300': 'C4B5FD',
        '400': 'A78BFA',
        '500': '8B5CF6',
        '600': '7C3AED',
        '700': '6D28D9',
        '800': '5B21B6',
        '900': '4C1D95',
        'A100': 'EDE9FE',
        'A200': 'C4B5FD',
        'A400': '8B5CF6',
        'A700': '6D28D9',
        'contrastDefaultColor': 'light',
        'contrastDarkColors': ['50', '100', '200', '300', 'A100', 'A200']
      });
      var rabbitGrey = $mdThemingProvider.extendPalette('grey', {
        // sidebar selected item, right panel, menus
        '200': 'F8F9FC',
        // sidebar background
        '300': 'EEF0F5',
        // busy periods in the attendees editor
        '1000': '3C4256'
      });
      $mdThemingProvider.definePalette('rabbit-violet', rabbitViolet);
      $mdThemingProvider.definePalette('rabbit-grey', rabbitGrey);

      $mdThemingProvider.theme('default')
        .primaryPalette('rabbit-violet', {
          'default': '600', // top toolbars
          'hue-1': '500',
          'hue-2': '700',   // sidebar toolbar
          'hue-3': 'A700'
        })
        .accentPalette('rabbit-violet', {
          'default': '600', // FAB buttons and login screen
          'hue-1': '100',   // center list toolbar
          'hue-2': '100',   // selected message, current day
          'hue-3': 'A700'
        })
        .backgroundPalette('rabbit-grey');

      $mdThemingProvider.generateThemesOnDemand(false);
    } catch (e) {
      if (window.console) console.warn('RabbitTech SOGo theme not applied', e);
    }
  }
})();
