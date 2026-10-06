-- SET-11 fix pass: an import goes in a batch per call, so it can be part in;
-- and the Check step flags what the commit would otherwise skip in silence.
ALTER TYPE "RetailImportStatus" ADD VALUE 'IMPORTING' BEFORE 'IMPORTED';

ALTER TYPE "RetailImportProblem" ADD VALUE 'COST_NOT_NUMBER';
ALTER TYPE "RetailImportProblem" ADD VALUE 'STOCK_NOT_NUMBER';
ALTER TYPE "RetailImportProblem" ADD VALUE 'PACK_NOT_NUMBER';
ALTER TYPE "RetailImportProblem" ADD VALUE 'SAME_NAME_IN_FILE';
ALTER TYPE "RetailImportProblem" ADD VALUE 'SAME_PRODUCT_IN_FILE';
