module.exports = {
  // Basic formatting
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  useTabs: false,
  printWidth: 100,
  trailingComma: 'es5',

  // JSX specific
  jsxSingleQuote: true,
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'avoid',

  // File handling
  endOfLine: 'lf',
  embeddedLanguageFormatting: 'auto',

  // Special files
  overrides: [
    {
      files: '*.css',
      options: {
        singleQuote: false,
      },
    },
  ],
};



