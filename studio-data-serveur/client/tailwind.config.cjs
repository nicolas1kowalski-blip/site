// Tailwind est compilé à la construction sur le HTML assemblé (client/dist/index.html). Les classes
// composées dynamiquement (couleurs par thème, badges) sont couvertes par la liste de sûreté ci-dessous.
const couleurs = ['slate', 'gray', 'zinc', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];
const nuances = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
module.exports = {
    content: [__dirname + '/dist/index.html'],
    safelist: [
        { pattern: new RegExp(`^(bg|text|border|ring)-(${couleurs.join('|')})-(${nuances.join('|')})$`), variants: ['hover'] },
        { pattern: /^(grid-cols|col-span)-(1|2|3|4|5|6|7|8|9|10|11|12)$/, variants: ['md', 'lg'] }
    ],
    theme: { extend: {} },
    plugins: []
};
