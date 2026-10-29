-- Uploaded mesh bytes kept in Postgres so a paid order's model survives a web restart.
CREATE TABLE "QuoteFile" (
    "quoteId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteFile_pkey" PRIMARY KEY ("quoteId")
);

ALTER TABLE "QuoteFile" ADD CONSTRAINT "QuoteFile_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
