PepX Research — WordPress theme

Install:
1. Copy the `pepx-research-chemicals` folder into your WordPress `wp-content/themes/` directory.
2. Activate the theme from the WP Admin > Appearance > Themes screen.
3. Create two pages named "Shop" and "Checkout".
   - For the Shop page, choose the "Shop Page" template.
   - For the Checkout page, choose the "Checkout Page" template.
4. The theme enqueues `/assets/style.css` and `/assets/script.js`. It currently imports the workspace `styles.css` for convenience. Adjust paths if you move assets.

Notes:
- This is a lightweight wrapper to run your static storefront inside WordPress. It assumes the same DOM structure as the static pages (IDs: `productGrid`, `productModal`, `cartBody`, `checkoutCart`, `cartTotal`, `cartCount`, etc.).
- For production, copy `styles.css` and `script.js` into the theme `assets/` folder and update `functions.php` accordingly.
