-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "recoveryCodes" TEXT[],
ADD COLUMN     "totpEnabledAt" TIMESTAMP(3),
ADD COLUMN     "totpLastStep" INTEGER,
ADD COLUMN     "totpSecretEnc" TEXT;

-- CreateTable
CREATE TABLE "public"."PendingLogin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "next" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingLogin_pkey" PRIMARY KEY ("id")
);
