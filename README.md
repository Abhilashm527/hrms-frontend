# hrms-frontend

Web app for the Ivoyant HRMS. The API lives in the `hrms` repository.

For now this is a placeholder page in `public/` so the site can be deployed.

## Deploy on Render (free)

1. Push this repository to GitHub.
2. Render dashboard → New → Blueprint → pick this repository → Apply.
3. In `render.yaml`, make the `/api/*` destination your API's real address.
4. On the API service (`hrms-api`) set `APP_BASE_URL` to this site's address
   (for example `https://hrms-web.onrender.com`, no trailing slash).

When the real app exists, change `buildCommand` and `staticPublishPath` in `render.yaml`.
