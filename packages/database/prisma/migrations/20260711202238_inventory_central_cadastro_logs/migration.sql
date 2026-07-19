-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "currentQuantity" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "quantityDelta" INTEGER NOT NULL,
    "resultingQuantity" INTEGER NOT NULL,
    "performedByUserId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "illegal_actions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "registeredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "illegal_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "illegal_action_participants" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "shareAmount" INTEGER,

    CONSTRAINT "illegal_action_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_goal_submissions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "weekStartDate" TIMESTAMP(3) NOT NULL,
    "amountDelivered" INTEGER NOT NULL,
    "registeredByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_goal_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "character_registrations" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "characterServerId" INTEGER NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "referredByUserId" TEXT,
    "status" TEXT NOT NULL,
    "nicknameAtSubmission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "character_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_log_configs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_log_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_items_guildId_isActive_idx" ON "inventory_items"("guildId", "isActive");

-- CreateIndex
CREATE INDEX "inventory_movements_guildId_itemId_idx" ON "inventory_movements"("guildId", "itemId");

-- CreateIndex
CREATE INDEX "illegal_actions_guildId_idx" ON "illegal_actions"("guildId");

-- CreateIndex
CREATE INDEX "illegal_action_participants_actionId_idx" ON "illegal_action_participants"("actionId");

-- CreateIndex
CREATE INDEX "weekly_goal_submissions_guildId_discordUserId_weekStartDate_idx" ON "weekly_goal_submissions"("guildId", "discordUserId", "weekStartDate");

-- CreateIndex
CREATE INDEX "character_registrations_guildId_discordUserId_idx" ON "character_registrations"("guildId", "discordUserId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_log_configs_guildId_feature_key" ON "feature_log_configs"("guildId", "feature");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "illegal_actions" ADD CONSTRAINT "illegal_actions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "illegal_action_participants" ADD CONSTRAINT "illegal_action_participants_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "illegal_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_goal_submissions" ADD CONSTRAINT "weekly_goal_submissions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "character_registrations" ADD CONSTRAINT "character_registrations_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_log_configs" ADD CONSTRAINT "feature_log_configs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
