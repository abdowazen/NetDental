ALTER TABLE "User"
ADD COLUMN "defaultPage" VARCHAR(40) NOT NULL DEFAULT 'automatic';

ALTER TABLE "User"
ADD CONSTRAINT "User_defaultPage_valid" CHECK (
  "defaultPage" IN (
    'automatic',
    'dashboard',
    'appointments',
    'patients',
    'treatment',
    'procedures',
    'laboratories',
    'clinicalAnalytics',
    'newPatients',
    'patientsStatement',
    'labStatement',
    'billingAnalytics',
    'inventoryAnalytics',
    'billsPayments',
    'billCategories',
    'purchaseInvoices',
    'supplies',
    'suppliers',
    'generalSettings',
    'currencySetup',
    'backupRestore',
    'help',
    'adminUsers',
    'adminLocations',
    'adminLogs'
  )
);
