/*
  Warnings:

  - The primary key for the `local_credential` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `local_credential` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The primary key for the `oauth_credential` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The `id` column on the `oauth_credential` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "local_credential" DROP CONSTRAINT "local_credential_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "local_credential_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "oauth_credential" DROP CONSTRAINT "oauth_credential_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" SERIAL NOT NULL,
ADD CONSTRAINT "oauth_credential_pkey" PRIMARY KEY ("id");
