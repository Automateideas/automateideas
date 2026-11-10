# UNIVERSAL SAAS BILLING SYSTEM

## Complete Master Development Prompt

### Existing SaaS Integration | Multi-Tenant | Business Billing | Subscription Management | Financial Management

---

# 1. PROJECT OVERVIEW

I have an existing multi-purpose SaaS application that provides different business management modules to registered companies.

My application may include:

- HRMS
- CRM
- Inventory Management
- Task Management
- Workflow Automation
- FMS
- Business Analytics
- Other business management tools

I want to introduce a complete, independent and configurable **Universal Billing & Financial Management Module** into my existing SaaS application.

The new module must allow every registered company to manage its own business billing and generate invoices for its own customers.

The system must support different industries and business models, including:

- Retail businesses
- Wholesale businesses
- Manufacturing companies
- Service-based companies
- IT companies
- Consultancy businesses
- Restaurants
- Project-based businesses
- Agencies
- Subscription-based businesses
- Trading companies
- Other business types

The system must be flexible enough to support future business models without requiring a complete architectural redesign.

# 2. MOST IMPORTANT: TWO DIFFERENT BILLING SYSTEMS

My application will have two completely different billing systems.

These systems must have separate routes, database domains, business logic, permissions and financial records.

## SYSTEM A: SAAS SUBSCRIPTION MANAGEMENT

This is my existing billing functionality.

Purpose: My SaaS platform charges registered companies for using my SaaS services.

Invoice issuer: My SaaS company, Automate Ideas.

Invoice recipient: Registered companies using my SaaS.

Responsibilities:

- Subscription Plans
- Monthly and Yearly Plans
- Free Trials
- Subscription Activation
- Subscription Renewals
- Plan Upgrades
- Plan Downgrades
- Subscription Cancellation
- Subscription Payment History
- Subscription Invoices
- Payment Gateway Integration
- Usage Tracking
- Feature Restrictions
- Subscription Expiry
- Grace Period
- SaaS Revenue Reports

## SYSTEM B: UNIVERSAL BUSINESS BILLING

This is the new module to be developed.

Purpose: Every registered company can use my SaaS to generate invoices for its own customers.

Invoice issuer: Individual registered tenant company.

Invoice recipient: That company's own customer.

Responsibilities:

- Sales Invoices
- GST Billing
- Non-GST Billing
- Quotations
- Proforma Invoices
- Sales Orders
- Purchase Bills
- Customers
- Suppliers
- Products
- Services
- Payments
- Credit Notes
- Debit Notes
- Outstanding Management
- Customer Ledger
- Inventory Integration
- Accounting
- Financial Reports

## STRICT SEPARATION

Never mix the financial data of these two systems.

Examples:

1. Automate Ideas generates a subscription invoice for ABC Enterprises.
2. ABC Enterprises generates a sales invoice for its customer Rahul.
3. ABC Enterprises' sales invoice must never appear in Automate Ideas' subscription revenue reports.
4. Automate Ideas' subscription invoice must never appear in ABC Enterprises' business sales reports.

Maintain completely separate invoice sequences, payment records, permissions and reporting.

# 3. ROUTING STRUCTURE – IMPORTANT

My existing application currently uses `/billing` for SaaS subscription billing.

I want to change this routing structure.

## A. EXISTING SUBSCRIPTION BILLING ROUTES

Move the existing subscription billing functionality from `/billing` to `/subscription`.

Recommended routes:

- `/subscription`
- `/subscription/plans`
- `/subscription/current`
- `/subscription/history`
- `/subscription/invoices`
- `/subscription/payments`
- `/subscription/settings`

Preserve all existing subscription functionality.

Do not unnecessarily change the existing subscription APIs, components, database models or payment integrations.

Inspect all existing route references and update them safely.

If required, create appropriate redirects from the old routes to their new destinations.

## B. NEW BUSINESS BILLING ROUTES

Create the new Universal Business Billing module under `/billing`.

Recommended routes:

**Dashboard**

- `/billing`

**Sales**

- `/billing/invoices`
- `/billing/invoices/create`
- `/billing/invoices/:id`
- `/billing/quotations`
- `/billing/sales-orders`
- `/billing/delivery-challans`
- `/billing/credit-notes`
- `/billing/debit-notes`
- `/billing/sales-returns`

**Customers**

- `/billing/customers`
- `/billing/customers/create`
- `/billing/customers/:id`

**Products and Services**

- `/billing/products`
- `/billing/services`
- `/billing/categories`
- `/billing/units`
- `/billing/price-lists`

**Payments**

- `/billing/payments`
- `/billing/payment-receipts`
- `/billing/refunds`
- `/billing/outstanding`

**Purchases**

- `/billing/purchases`
- `/billing/purchase-orders`
- `/billing/purchase-bills`
- `/billing/suppliers`
- `/billing/purchase-returns`

**Inventory**

- `/billing/stock`
- `/billing/warehouses`
- `/billing/stock-adjustments`

**Accounting**

- `/billing/accounting`
- `/billing/ledger`
- `/billing/journal-entries`
- `/billing/trial-balance`
- `/billing/profit-loss`
- `/billing/balance-sheet`

**Reports**

- `/billing/reports`
- `/billing/reports/sales`
- `/billing/reports/purchases`
- `/billing/reports/tax`
- `/billing/reports/payments`

**Settings**

- `/billing/settings`
- `/billing/settings/company`
- `/billing/settings/tax`
- `/billing/settings/invoices`
- `/billing/settings/templates`
- `/billing/settings/financial-year`

Use existing routing conventions and avoid creating unnecessary routes.

# 4. CRITICAL EXISTING APPLICATION PROTECTION

This is not a new application development project.

This is an existing SaaS application, and the new billing module must be integrated into it without disturbing existing modules.

## Strict rules

1. Do not rebuild the existing application.
2. Do not replace the existing technology stack unnecessarily.
3. Do not modify existing HRMS business logic.
4. Do not modify existing CRM functionality.
5. Do not modify existing Inventory functionality unless an explicitly approved integration is required.
6. Do not break existing task management or automation functionality.
7. Do not replace existing authentication.
8. Do not create duplicate user management systems.
9. Do not unnecessarily modify existing database structures.
10. Do not overwrite existing global CSS, themes or design tokens.
11. Do not change existing shared components in a breaking manner.
12. Do not remove existing functionality.
13. Do not modify unrelated APIs.
14. Do not change existing user permissions without understanding their impact.

Create billing-specific components, services, routes, APIs, database models and migrations.

Reuse existing platform authentication, user management and shared infrastructure wherever appropriate.

## Before implementation

First inspect:

- Complete project structure
- Existing frontend architecture
- Existing backend architecture
- Database architecture
- Authentication system
- Authorization and permissions
- Existing routes
- Existing sidebar
- Existing UI components
- Existing modules and their dependencies
- Existing API integrations

Prepare an implementation plan before modifying code.

If any change may affect an existing module, explain the impact and request approval before proceeding.

# 5. MULTI-TENANT ARCHITECTURE

The new business billing module must support multiple companies.

Each company must have completely independent business data.

Every tenant must have its own:

- Company profile
- Billing settings
- Customers
- Suppliers
- Products
- Services
- Invoices
- Quotations
- Payments
- Purchases
- Tax configuration
- Financial records
- Reports

Use the existing tenant architecture if one already exists.

Otherwise, design a secure multi-tenant architecture.

Requirements:

- Tenant identification
- Tenant-specific data access
- Tenant-scoped API requests
- Database-level access restrictions
- Role-based access control
- Tenant-specific invoice sequences
- Tenant-specific financial year
- Tenant-specific tax settings
- Tenant-specific branding

Every tenant-owned record must have an appropriate tenant identifier.

Never rely only on frontend filtering for data security.

Use database constraints, backend authorization and row-level security where supported.

# 6. COMPANY BILLING CONFIGURATION

Each company must be able to configure its own billing profile.

Fields:

- Legal Company Name
- Business Display Name
- Company Logo
- GSTIN
- PAN
- Registered Address
- Billing Address
- Shipping Address
- Email
- Phone
- Website
- Bank Name
- Account Number
- IFSC Code
- Branch
- UPI ID
- Financial Year
- Currency
- Default Payment Terms
- Invoice Prefix
- Invoice Numbering Format
- Default Tax Settings

Support multiple branches and branch-specific billing configurations where needed.

Each company must have its own invoice branding and PDF templates.

# 7. CUSTOMER MANAGEMENT

Build a complete customer management system.

Features:

- Individual Customer
- Business Customer
- Registered GST Customer
- Unregistered Customer
- Customer GSTIN
- Customer Name
- Contact Person
- Mobile Number
- Email
- Billing Address
- Shipping Address
- State and State Code
- Country
- Opening Balance
- Credit Limit
- Payment Terms
- Customer Category
- Customer Notes
- Customer Ledger
- Outstanding Amount
- Customer Transaction History

Allow users to create new customers while generating invoices.

Prevent duplicate customer records where practical.

# 8. SUPPLIER MANAGEMENT

Features:

- Supplier Profile
- Supplier GSTIN
- Contact Information
- Billing Address
- Bank Details
- Opening Balance
- Purchase History
- Supplier Payments
- Outstanding Payables
- Supplier Ledger

# 9. PRODUCT AND SERVICE MANAGEMENT

Create a flexible product and service catalogue.

Product fields:

- Product Name
- SKU
- Product Code
- Barcode
- Description
- Category
- Brand
- HSN Code
- Unit
- Purchase Price
- Selling Price
- Tax Rate
- Product Image
- Stock Tracking Option
- Minimum Stock
- Active/Inactive Status

Service fields:

- Service Name
- Service Code
- SAC Code
- Description
- Service Category
- Unit
- Rate
- Tax Rate
- Active/Inactive Status

Support:

- Physical products
- Non-physical products
- Services
- Product variants
- Multiple units
- Multiple price lists
- Custom invoice items
- Industry-specific items

Do not force inventory management on service-based businesses.

# 10. UNIVERSAL INVOICE MANAGEMENT

Create a reusable invoice engine.

Supported documents:

1. Tax Invoice
2. Non-GST Invoice
3. Proforma Invoice
4. Quotation
5. Sales Order
6. Delivery Challan
7. Credit Note
8. Debit Note
9. Sales Return
10. Recurring Invoice
11. Payment Receipt
12. Purchase Bill

## Invoice creation workflow

1. Select customer.
2. Select invoice type.
3. Select products or services.
4. Enter quantity and unit.
5. Enter selling price.
6. Apply item discount.
7. Calculate taxable amount.
8. Calculate applicable taxes.
9. Apply invoice discount.
10. Add shipping or additional charges.
11. Calculate round-off.
12. Calculate grand total.
13. Save as draft or issue invoice.
14. Generate PDF.
15. Record payment.
16. Track outstanding amount.

Support:

- Draft
- Issued
- Partially Paid
- Paid
- Overdue
- Cancelled
- Reversed / Voided, as applicable

Issued financial documents must not be freely editable.

Use proper correction, cancellation and credit/debit note workflows.

# 11. UNIVERSAL TAX ENGINE

Create an independent reusable tax engine.

For Indian businesses support:

- CGST
- SGST
- IGST
- GST-inclusive pricing
- GST-exclusive pricing
- Multiple GST rates
- HSN
- SAC
- Taxable Value
- Item Discount
- Invoice Discount
- Additional Charges
- Round-off
- Exempt Supplies
- Zero-rated Supplies
- Place of Supply
- Reverse Charge Configuration

Allow future country-specific tax systems such as VAT and sales tax.

Tax calculations must happen on the backend.

Use decimal-safe financial calculations.

Do not hardcode tax percentages throughout the application.

Support effective dates and configurable tax classifications.

Validate GST compliance against applicable regulations before production deployment.

# 12. INVOICE NUMBERING

Every company must have independent numbering sequences.

Examples:

ABC/2026-27/001

ABC/2026-27/002

XYZ/2026-27/001

Requirements:

- Custom Prefix
- Financial Year
- Branch-specific numbering
- Document-specific numbering
- Automatic Number Generation
- Duplicate Prevention
- Concurrent Request Safety
- Transaction-safe Number Allocation

Use database-level locking or an equivalent atomic mechanism.

Never generate invoice numbers using simple frontend counters.

# 13. PAYMENT MANAGEMENT

Support:

- Cash
- UPI
- Bank Transfer
- Cheque
- Payment Gateway
- Advance Payment
- Partial Payment
- Full Payment
- Refund
- Payment Adjustment

Payment functionality:

- Payment Receipt
- Payment Reference Number
- Payment Date
- Payment Method
- Customer
- Invoice Allocation
- Amount Received
- Unallocated Advance
- Refund History

One payment must be allocatable to multiple invoices where appropriate.

Avoid duplicate payment processing through idempotency.

# 14. PURCHASE MANAGEMENT

Build:

- Purchase Orders
- Purchase Bills
- Supplier Payments
- Purchase Returns
- Debit Notes
- Purchase Reports

Allow purchase bill creation independently or from a purchase order.

# 15. INVENTORY INTEGRATION

The billing module must support optional integration with the existing Inventory module.

Features:

- Stock In
- Stock Out
- Purchase Stock
- Sales Stock
- Stock Adjustment
- Sales Returns
- Purchase Returns
- Multiple Warehouses
- Stock Valuation
- Low Stock Alerts

IMPORTANT:

If the existing application already contains an Inventory module, reuse its existing functionality and data models where appropriate.

Do not create a duplicate inventory system.

If Inventory is not enabled for a company, business billing must still work normally.

Use explicit integration events for stock updates.

# 16. ACCOUNTING AND FINANCIAL MANAGEMENT

Create an accounting-ready architecture.

Features:

- Chart of Accounts
- Journal Entries
- General Ledger
- Customer Ledger
- Supplier Ledger
- Accounts Receivable
- Accounts Payable
- Trial Balance
- Profit and Loss
- Balance Sheet
- Cash Flow
- Financial Year Management

Use double-entry accounting.

Every posted journal entry must have balanced debit and credit totals.

Use immutable posted records and reversal entries for corrections.

Example:

Sales Invoice:

Customer Receivable — Debit

Sales Revenue — Credit

Output GST — Credit

Payment Received:

Bank — Debit

Customer Receivable — Credit

Maintain a complete financial audit trail.

Do not claim accounting or statutory compliance without validating the implementation.

# 17. BILLING DASHBOARD

Create a professional dashboard for each tenant.

Display:

- Total Sales
- Total Purchases
- Total Invoices
- Total Paid
- Total Outstanding
- Overdue Amount
- Monthly Sales
- Revenue Trends
- Recent Transactions
- Top Customers
- Top Products
- Payment Trends
- Tax Summary

Filters:

- Date Range
- Financial Year
- Branch
- Customer
- Invoice Status
- Payment Status

All dashboard data must be tenant-specific.

# 18. REPORTS AND ANALYTICS

Sales Reports:

- Daily Sales
- Weekly Sales
- Monthly Sales
- Annual Sales
- Customer-wise Sales
- Product-wise Sales
- Invoice-wise Sales

Purchase Reports:

- Purchase Summary
- Supplier-wise Purchase
- Purchase Returns

Financial Reports:

- Customer Outstanding
- Supplier Outstanding
- Payment Collection
- Customer Ledger
- Supplier Ledger
- Profit and Loss
- Balance Sheet
- Trial Balance
- Cash Flow

Tax Reports:

- GST Summary
- Taxable Sales
- Output Tax
- Input Tax

Support PDF, Excel and CSV exports wherever appropriate.

# 19. PDF AND INVOICE TEMPLATE ENGINE

Create a reusable PDF generation system.

Each company must be able to customize:

- Logo
- Company Details
- Invoice Header
- Footer
- Color Theme
- Font
- Invoice Layout
- Bank Details
- Terms and Conditions
- Signature
- Stamp

Provide multiple invoice templates.

Requirements:

- A4 Format
- Print-friendly Design
- Mobile-readable PDF
- Proper GST breakdown
- Amount in Words
- QR Code support where applicable
- Page Numbering
- Multi-page Invoice Support

Generate PDFs using trusted backend processes.

Store generated documents securely.

# 20. COMMUNICATION AND AUTOMATION

Integrate:

- Email Invoice Sharing
- WhatsApp Invoice Sharing
- Payment Reminders
- Due Date Notifications
- Overdue Alerts
- Invoice Notifications
- Payment Confirmation

Use the existing notification infrastructure if available.

WhatsApp integrations must use authorized APIs and approved templates where required.

# 21. SAAS SUBSCRIPTION MANAGEMENT

Preserve and migrate my existing SaaS subscription billing functionality.

Route namespace:

`/subscription/*`

Features:

- Subscription Plans
- Monthly and Yearly Plans
- Free Trials
- Plan Upgrades
- Plan Downgrades
- Renewals
- Subscription Invoices
- Subscription Payments
- Payment Gateway
- Subscription Expiry
- Grace Period
- Usage Limits
- Feature Entitlements
- Cancellation

Build a feature entitlement system.

Example:

{
"billing": true,
"inventory": true,
"whatsapp": true,
"maxUsers": 10,
"maxInvoices": 2000,
"advancedReports": false
}

Enforce plan limits on the backend.

Subscription expiry must not delete tenant business records.

Preserve appropriate read-only access, export and data-retention policies.

Keep subscription records completely separate from business billing records.

# 22. DATABASE ARCHITECTURE

Inspect the existing database first.

Reuse existing entities where appropriate and create new isolated structures only when required.

Suggested logical groups:

**Platform**

- tenants
- users
- memberships
- roles
- permissions

**Subscription**

- subscription_plans
- subscriptions
- subscription_features
- usage_records
- subscription_invoices
- subscription_payments

**Business Billing**

- billing_settings
- invoice_sequences
- business_invoices
- business_invoice_items
- quotations
- sales_orders
- credit_notes
- debit_notes

**Catalogue**

- products
- services
- categories
- units
- price_lists

**Contacts**

- customers
- suppliers
- addresses

**Payments**

- business_payments
- payment_allocations
- refunds

**Purchasing**

- purchase_orders
- purchase_bills
- purchase_items

**Inventory**

- warehouses
- stock_movements
- stock_adjustments

**Accounting**

- accounts
- journal_entries
- journal_lines
- financial_periods

**System**

- audit_logs
- notifications
- files
- webhook_events

This is a logical design, not an instruction to duplicate existing tables.

Use appropriate:

- Primary Keys
- Foreign Keys
- Unique Constraints
- Indexes
- Tenant Identifiers
- Database Transactions
- Migrations
- Validation
- Row-Level Security where supported

Maintain separate platform and tenant financial data.

# 23. FRONTEND ARCHITECTURE

Follow the existing frontend architecture.

Suggested module organization:

src/
modules/
billing/
dashboard/
invoices/
quotations/
customers/
suppliers/
products/
services/
payments/
purchases/
accounting/
reports/
settings/

    subscription/
      plans/
      current/
      history/
      invoices/
      payments/

    hrms/
    crm/
    inventory/
    automation/

shared/
components/
hooks/
services/
utils/
types/

Do not force this exact structure if the existing project already follows another well-organized architecture.

Create reusable components:

- InvoiceForm
- InvoicePreview
- CustomerSelector
- ProductSelector
- TaxCalculator
- PaymentForm
- InvoiceTable
- PDFViewer
- ReportFilters

Maintain existing application styling, design tokens and responsive conventions.

# 24. BACKEND ARCHITECTURE

Organize backend functionality into independent modules.

Suggested modules:

- Authentication
- Tenant Management
- Subscription Management
- Billing
- Customers
- Suppliers
- Products
- Tax Engine
- Invoice Engine
- Payments
- Purchases
- Accounting
- Inventory Integration
- Notifications
- File Management
- Reporting

Use the existing backend framework.

If a new backend module is needed, integrate it into the current architecture rather than replacing the backend.

Use REST APIs or the existing API convention.

Validate all financial operations server-side.

Use database transactions for critical financial operations.

Use background jobs for PDF generation, scheduled invoices and notifications.

# 25. SECURITY AND DATA PROTECTION

Implement:

- Authentication
- Role-Based Access Control
- Tenant Isolation
- Backend Authorization
- Database-Level Access Policies
- Secure File Uploads
- Encryption in Transit
- Sensitive Data Protection
- Rate Limiting
- Webhook Verification
- Audit Logs
- Database Backups
- Recovery Procedures
- Idempotency

Never trust tenant identifiers, invoice totals or payment amounts supplied by the frontend without server-side validation.

Never allow one tenant to access another tenant's records.

# 26. TESTING AND REGRESSION PROTECTION

Before implementation, run and document existing application tests.

After each development phase, verify:

**Billing Tests**

- Invoice Creation
- Invoice Calculations
- GST Calculations
- Discounts
- Tax-inclusive Pricing
- Tax-exclusive Pricing
- Invoice Numbering
- Concurrent Invoice Generation
- Partial Payments
- Payment Allocation
- Outstanding Calculations
- Credit Notes
- PDF Generation

**Subscription Tests**

- Plan Selection
- Subscription Activation
- Renewals
- Expiry
- Upgrade
- Downgrade
- Payment Webhooks
- Feature Entitlements

**Isolation Tests**

- Platform Billing vs Business Billing
- Tenant A vs Tenant B
- Customer Data Isolation
- Payment Data Isolation
- Invoice Data Isolation

**Existing Application Regression Tests**

- HRMS
- CRM
- Inventory
- Automation
- Authentication
- User Management
- Existing Navigation
- Existing Permissions
- Existing APIs

No existing module should lose functionality because of the new billing implementation.

# 27. DEVELOPMENT PHASES

Follow the following implementation sequence.

## Phase 1: Existing Project Audit

- Inspect the complete project.
- Understand existing routes.
- Inspect existing `/billing`.
- Identify subscription functionality.
- Document existing database structures.
- Identify reusable services.
- Identify integration risks.
- Prepare an implementation plan.

Do not modify code during this phase.

## Phase 2: Subscription Route Migration

- Move existing subscription billing routes to `/subscription/*`.
- Update internal references.
- Preserve existing components and functionality.
- Preserve payment integrations.
- Add redirects where appropriate.
- Test existing subscription functionality.

## Phase 3: Business Billing Foundation

- Create independent `/billing/*` routes.
- Create billing navigation.
- Create billing-specific permissions.
- Implement company billing configuration.
- Implement tenant isolation.
- Create database migrations.

## Phase 4: Core Business Billing

- Customer Management
- Supplier Management
- Products and Services
- Tax Engine
- Invoice Engine
- Invoice Numbering
- PDF Generation

## Phase 5: Payments and Financial Management

- Payment Management
- Partial Payments
- Outstanding
- Customer Ledger
- Purchase Management
- Accounting
- Financial Reports

## Phase 6: Advanced Integrations

- Inventory Integration
- WhatsApp
- Email
- Recurring Invoices
- E-Invoice
- E-Way Bill
- Payment Gateway

## Phase 7: Final Testing and Optimization

- Security Testing
- Tenant Isolation Testing
- Financial Calculation Testing
- Regression Testing
- Performance Testing
- UI Testing
- Documentation

# 28. STRICT AI CODING AGENT WORKFLOW

Follow this workflow for every phase.

1. Understand the requirement.
2. Inspect the existing code.
3. Identify dependencies.
4. Identify files to create.
5. Identify files to modify.
6. Explain database changes.
7. Explain potential impact on existing modules.
8. Implement the feature.
9. Add backend validation.
10. Add security and authorization.
11. Write automated tests.
12. Run tests.
13. Fix errors.
14. Verify existing functionality.
15. Update implementation documentation.
16. Update the development checklist.

Do not implement all phases in a single uncontrolled operation.

Do not claim a feature is complete if it only contains placeholder UI.

Do not use mock data in production functionality.

Do not skip database migrations.

Do not silently change existing functionality.

If any requirement is ambiguous or could affect an existing module, ask for clarification before making a breaking change.

# 29. FINAL EXPECTED RESULT

I want a professional, scalable and configurable Universal Billing & Financial Management System integrated into my existing multi-purpose SaaS application.

The final architecture must maintain:

**Platform Subscription Management**

- Route: `/subscription/*`
- Used by my SaaS platform to manage subscriptions and charge registered companies.

**Universal Business Billing**

- Route: `/billing/*`
- Used by registered companies to bill their own customers.

Both systems must remain independent.

The new business billing module must support multiple industries and business models.

The existing HRMS, CRM, Inventory, Automation and other modules must continue working without regression.

The architecture must support future expansion and optional integrations.

---

# 30. FIRST TASK – DO NOT START CODING IMMEDIATELY

Start by performing a complete audit of my existing application.

Return the following:

1. Existing project architecture.
2. Existing technology stack.
3. Existing database architecture.
4. Existing authentication and authorization.
5. Existing `/billing` route and all its dependencies.
6. Proposed `/subscription` migration plan.
7. Proposed new `/billing` architecture.
8. Database changes required.
9. Existing modules that may be affected.
10. Security and data isolation strategy.
11. Implementation phases.
12. Potential risks and prevention strategy.

Present the audit and implementation plan first.

Wait for my approval before performing major changes.

**PRIMARY OBJECTIVE: Add a new Universal Business Billing module without rebuilding, breaking or unnecessarily modifying my existing SaaS application.**

The existing application must remain stable throughout the entire implementation process.

Stage 8, PDFs: templates, amount in words, GST breakdown.
Stage 9, Payments: partial payments, allocation to invoices, refunds, outstanding amounts, customer ledger.
Stage 10, Purchases: purchase orders, purchase bills, supplier payments.
Stage 11, Accounting: chart of accounts, journal entries posted automatically, balance checks, trial balance, profit and loss, balance sheet.
Stage 12, Dashboard and reports: including CSV and Excel exports.
Stage 13, Subscription: plans, feature limits, grace period.
Stage 14, Integrations: inventory, email and WhatsApp, recurring invoices, e-invoicing.
Stage 15, Security, isolation and regression review.
