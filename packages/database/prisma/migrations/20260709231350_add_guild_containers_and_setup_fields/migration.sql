-- AlterTable
ALTER TABLE "guild_settings" ADD COLUMN     "allowedRoleIds" TEXT[],
ADD COLUMN     "defaultChannelId" TEXT;

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "provider" SET DEFAULT 'MERCADO_PAGO';

-- CreateTable
CREATE TABLE "guild_containers" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "repostDelay" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_containers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guild_containers_guildId_isActive_idx" ON "guild_containers"("guildId", "isActive");

-- CreateIndex
CREATE INDEX "guild_containers_messageId_idx" ON "guild_containers"("messageId");

-- AddForeignKey
ALTER TABLE "guild_containers" ADD CONSTRAINT "guild_containers_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
