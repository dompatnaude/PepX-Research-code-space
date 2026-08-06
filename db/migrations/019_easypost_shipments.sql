-- 019_easypost_shipments.sql
-- shipments table for the EasyPost integration. Additive only; safe to re-run.
CREATE TABLE IF NOT EXISTS shipments (
  id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      provider TEXT,
        provider_shipment_id TEXT,
          provider_tracker_id TEXT,
            rate_id TEXT,
              carrier TEXT,
                service TEXT,
                  tracking_number TEXT,
                    tracking_url TEXT,
  label_url TEXT,
  label_format TEXT,
  label_cost NUMERIC(12,2),
  currency TEXT,
  shipment_status TEXT NOT NULL DEFAULT 'unknown',
  is_voided BOOLEAN NOT NULL DEFAULT FALSE,
  voided_at TIMESTAMPTZ,
  purchased_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments (order_id);
CREATE INDEX IF NOT EXISTS idx_shipments_provider_shipment_id ON shipments (provider_shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipments_provider_tracker_id ON shipments (provider_tracker_id);
CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments (tracking_number);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_weight_oz NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_length_in NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_width_in NUMERIC(10,2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ship_height_in NUMERIC(10,2);Fix the “API endpoint not found” error when clicking Save Draft in the Add COA modal.

Current behavior:
- Product dropdown loads correctly.
- Form fields can be completed.
- Clicking “Save Draft” returns “API endpoint not found.”
- The COA list also shows “Failed to load COAs,” so both the save route and possibly the COA list route may be missing or mismatched.

Please inspect the existing codebase and fix this end-to-end.

1. Find the frontend function used by the Add COA form when Save Draft is clicked.
2. Identify the exact URL and HTTP method it is calling.
3. Find the existing backend COA routes, if any.
4. Make the frontend and backend use matching routes.

Use a consistent REST structure such as:
- GET /api/admin/coas
- POST /api/admin/coas
- GET /api/admin/coas/:id
- PATCH /api/admin/coas/:id
- DELETE /api/admin/coas/:id

Do not add duplicate routes if equivalent COA routes already exist. Reuse the current route structure where possible.

For Save Draft:
- Send POST to the correct COA endpoint.
- Include credentials: "include" if admin authentication uses sessions.
- Submit multipart/form-data because a PDF, PNG, or JPG report file may be attached.
- Do not manually set the Content-Type header when using FormData.
- Include these fields:
  - product_id or variant_id
  - batch_number
  - lab_name
  - test_type
  - test_date
  - report_date
  - public_title
  - notes
  - status = "draft"
  - report_file

Backend requirements:
- Add or repair the POST COA route.
- Confirm the router is mounted in the Express server.
- Register the COA routes before the generic 404 “API endpoint not found” handler.
- Use the existing admin authentication middleware.
- Parse multipart uploads correctly using the project’s existing upload middleware.
- Validate that the selected product or variant exists.
- Insert the COA into the existing COA database table.
- Store the correct product/variant relationship.
- Save the uploaded report using the project’s current file-storage system.
- Return a JSON response such as:
  {
    "success": true,
    "coa": { ... }
  }

Also fix the COA list:
- Make sure the admin COA page loads from the correct GET endpoint.
- After saving a draft, close the modal and refresh the COA table.
- Display the new COA with Draft status.
- Show the backend error message instead of only “API endpoint not found.”

Check for these common causes:
- frontend calls /api/admin/coa but backend uses /api/admin/coas
- frontend calls /api/coas but router is mounted at /api/admin/coas
- POST route does not exist
- COA router was created but never mounted
- route is declared after the 404 fallback
- wrong HTTP method
- request is JSON even though a file upload requires multipart/form-data

Add temporary logging for:
- request method
- request URL
- response status
- response body

Then test:
1. Open Add COA.
2. Select GLP-3RT — 10mg.
3. Enter the form values.
4. Attach the report PDF.
5. Click Save Draft.
6. Confirm the request returns 200 or 201.
7. Confirm the database record is created.
8. Confirm the COA appears in the admin table.
9. Confirm refreshing the page still shows it.
10. Confirm there are no console or server errors.

Do not hardcode the product or variant.