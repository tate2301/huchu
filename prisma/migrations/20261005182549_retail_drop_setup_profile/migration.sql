-- SET-04: the JSON "setup profile" (default till) is gone; a till is whichever one a device is paired to.
DELETE FROM "FiscalisationProviderConfig" WHERE "providerKey" = 'RETAIL_SETUP_PROFILE';
