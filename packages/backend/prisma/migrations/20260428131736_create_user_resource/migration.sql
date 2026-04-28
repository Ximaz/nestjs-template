-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_credential" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "oauth_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "local_credential" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "hashedPassword" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "local_credential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_credential_user_id_key" ON "oauth_credential"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_credential_provider_sub_key" ON "oauth_credential"("provider", "sub");

-- CreateIndex
CREATE UNIQUE INDEX "local_credential_email_key" ON "local_credential"("email");

-- CreateIndex
CREATE UNIQUE INDEX "local_credential_user_id_key" ON "local_credential"("user_id");

-- AddForeignKey
ALTER TABLE "oauth_credential" ADD CONSTRAINT "oauth_credential_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "local_credential" ADD CONSTRAINT "local_credential_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
