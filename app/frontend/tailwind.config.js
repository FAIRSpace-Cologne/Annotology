/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./src/**/*.{js,jsx,ts,tsx}",
        "./public/index.html"
    ],
    theme: {
        extend: {
            colors: {
                // Brand palette derived from the project's Adobe Color theme.
                // cobalt = primary actions/links, olive = dark/secondary accents,
                // blossom = controlled-vocabulary / highlight feature color,
                // citrus = affirmative / sort / secondary highlight,
                // sky = soft tinted backgrounds.
                cobalt: {
                    50: '#F6F8FF', 100: '#E9EEFF', 200: '#CDD8FF', 300: '#AEC1FF',
                    400: '#819EFF', 500: '#4B75FF', 600: '#4063D9', 700: '#3350AD',
                    800: '#273D85', 900: '#1C2C61',
                },
                olive: {
                    50: '#F7F7F2', 100: '#EBEDE0', 200: '#D0D4B8', 300: '#B3BB8C',
                    400: '#89954C', 500: '#566700', 600: '#495800', 700: '#3A4600',
                    800: '#2D3600', 900: '#212700',
                },
                blossom: {
                    50: '#FFFAFD', 100: '#FFF2FB', 200: '#FFE1F5', 300: '#FFCFEF',
                    400: '#FFB4E6', 500: '#FF94DB', 600: '#D97EBA', 700: '#AD6595',
                    800: '#854D72', 900: '#613853',
                },
                citrus: {
                    50: '#FBFDF2', 100: '#F6FBE0', 200: '#EBF5B8', 300: '#DEEF8C',
                    400: '#CCE64C', 500: '#B6DB00', 600: '#9BBA00', 700: '#7C9500',
                    800: '#5F7200', 900: '#455300',
                },
                sky: {
                    50: '#FEFEFF', 100: '#FCFDFF', 200: '#F8FBFF', 300: '#F3F8FF',
                    400: '#EDF4FE', 500: '#E5F0FE', 600: '#C3CCD8', 700: '#9CA3AD',
                    800: '#777D84', 900: '#575B61',
                },
            },
            animation: {
                'slide-in': 'slide-in 0.3s ease-out',
                'slide-up': 'slide-up 0.3s ease-out',
                'slide-down': 'slide-down 0.3s ease-out',
                'fade-in': 'fade-in 0.3s ease-out',
                'pulse-slow': 'pulse-slow 1.8s ease-in-out infinite',
            },
            keyframes: {
                'slide-in': {
                    from: { transform: 'translateX(100%)', opacity: '0' },
                    to: { transform: 'translateX(0)', opacity: '1' },
                },
                'slide-up': {
                    from: { transform: 'translateY(100%)', opacity: '0' },
                    to: { transform: 'translateY(0)', opacity: '1' },
                },
                'slide-down': {
                    from: { transform: 'translateY(-10px)', opacity: '0' },
                    to: { transform: 'translateY(0)', opacity: '1' },
                },
                'fade-in': {
                    from: { opacity: '0' },
                    to: { opacity: '1' },
                },
                'pulse-slow': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.72' },
                },
            },
        },
    },
    plugins: [],
  }