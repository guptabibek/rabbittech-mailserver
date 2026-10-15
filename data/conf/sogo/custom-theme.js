/* RabbitTech Mail theme for SOGo (mounted as WebServerResources/js/theme.js).
 * Violet palettes matching the RabbitTech console, in light and dark.
 *
 * - Webmail follows the console's light/dark choice (localStorage "mailcow_theme", same origin).
 *   custom-sogo.js sets <html data-theme> and adds the RabbitTech stylesheet before Angular
 *   starts; the dark palette is only used when that stylesheet is present, because SOGo's own
 *   CSS hard-codes white cards and dialogs that the stylesheet re-colours.
 * - In production SOGo also links css/theme-default.css, a pre-built copy of its stock theme
 *   that loads after the colours generated here and wins. Once this palette is configured,
 *   that link is removed so these colours apply.
 * - Any error leaves SOGo's stock theme in place instead of breaking webmail.
 */
(function() {
  'use strict';
  angular.module('SOGo.Common')
    .config(configure);

  configure.$inject = ['$mdThemingProvider'];
  function configure($mdThemingProvider) {
    var root = document.documentElement;
    try {
      var dark = root.getAttribute('data-theme') === 'dark' && window.rtSogoStyle === true;

      $mdThemingProvider.definePalette('rabbit-violet', $mdThemingProvider.extendPalette('deep-purple', {
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
        'contrastDarkColors': ['50', '100', '200', '300', '400', 'A100', 'A200']
      }));

      // SOGo's templates ask for background hues by number: 200 behind the reading pane,
      // 300 behind the folder list, 500 for "No message selected", 700 for calendar headings
      $mdThemingProvider.definePalette('rabbit-grey', $mdThemingProvider.extendPalette('grey', {
        '50': 'FFFFFF',
        '100': 'F1F3F8',
        '200': 'F5F6FA',
        '300': 'FBFBFD',
        '400': 'D5D9E3',
        '500': '8A90A4',
        '600': '686E82',
        '700': '5F667A',
        '800': '3C4256',
        '900': '10121B',
        'A100': 'FFFFFF',
        'A200': 'F8F9FC',
        'A400': 'F1F3F8',
        'A700': 'E6E8EF',
        // busy periods in the attendees editor
        '1000': '3C4256'
      }));

      $mdThemingProvider.definePalette('rabbit-night', $mdThemingProvider.extendPalette('grey', {
        '50': '0B0D12',
        '100': '161A23',
        '200': '0B0D12',
        '300': '0E1016',
        '400': '3A4257',
        '500': '858CA0',
        '600': '1C212C',
        '700': '9AA1B4',
        '800': '12151C',
        '900': '0B0D12',
        'A100': '12151C',
        'A200': '1C212C',
        'A400': '12151C',
        'A700': '161A23',
        '1000': 'C0C5D3',
        'contrastDefaultColor': 'light'
      }));

      var theme = $mdThemingProvider.theme('default');
      if (dark) {
        theme
          .primaryPalette('rabbit-violet', { 'default': '500', 'hue-1': '400', 'hue-2': '600', 'hue-3': 'A700' })
          // hue-1: list toolbars; hue-2: selected message and today in the calendar
          .accentPalette('rabbit-violet', { 'default': '600', 'hue-1': '800', 'hue-2': '900', 'hue-3': 'A700' })
          .backgroundPalette('rabbit-night', { 'default': 'A400', 'hue-1': '800', 'hue-2': '100', 'hue-3': 'A200' })
          .dark();
      } else {
        theme
          // default: top toolbars; hue-2: folder list header
          .primaryPalette('rabbit-violet', { 'default': '600', 'hue-1': '600', 'hue-2': '700', 'hue-3': 'A700' })
          // default: compose button; hue-1: list toolbars; hue-2: selected message and today
          .accentPalette('rabbit-violet', { 'default': '600', 'hue-1': '50', 'hue-2': '100', 'hue-3': 'A700' })
          .backgroundPalette('rabbit-grey');
      }

      $mdThemingProvider.generateThemesOnDemand(false);

      var stock = document.querySelector('link[href*="css/theme-default.css"]');
      if (stock) stock.parentNode.removeChild(stock);
      if (!dark) root.removeAttribute('data-theme');
    } catch (e) {
      root.removeAttribute('data-theme');
      if (window.console) console.warn('RabbitTech SOGo theme not applied', e);
    }
  }
})();
