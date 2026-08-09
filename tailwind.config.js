/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ['./public/index.html', './public/js/**/*.js'],
    corePlugins: {
        preflight: false
    },
    theme: {
        extend: {
            fontFamily: {
                sans: ['Cairo', 'Tahoma', 'Arial', 'sans-serif']
            },
            boxShadow: {
                panel: '0 12px 35px rgba(15, 23, 42, .06)',
                lift: '0 18px 45px rgba(15, 23, 42, .12)'
            }
        }
    }
};
