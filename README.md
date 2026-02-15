# Centurion

A minimal static website built with GitHub Actions and deployed to GitHub Pages.

## Setup

The website is automatically built and deployed to GitHub Pages when changes are pushed to the `main` branch.

- **Source**: `/docs` directory
- **Build**: GitHub Actions workflow in `.github/workflows/deploy.yml`
- **Deployment**: GitHub Pages (https://twitchard.github.io/centurion/)

## Local Development

Simply edit the files in the `/docs` directory:
- `index.html` - Main page
- `styles.css` - Styles

## Deployment

Push changes to the `main` branch to trigger automatic deployment:

```bash
git push origin main
```

The workflow will build and deploy your changes to GitHub Pages.
