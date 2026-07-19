-- AlterTable
ALTER TABLE "illegal_actions" ADD COLUMN     "actionTypeId" TEXT,
ADD COLUMN     "cityId" TEXT;

-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN     "locationId" TEXT;

-- CreateTable
CREATE TABLE "inventory_locations" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "allowedRoleIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "illegal_action_cities" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "illegal_action_cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "illegal_action_types" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "maxParticipants" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "illegal_action_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inventory_locations_guildId_idx" ON "inventory_locations"("guildId");

-- CreateIndex
CREATE INDEX "illegal_action_cities_guildId_idx" ON "illegal_action_cities"("guildId");

-- CreateIndex
CREATE INDEX "illegal_action_types_cityId_idx" ON "illegal_action_types"("cityId");

-- CreateIndex
CREATE INDEX "illegal_action_types_guildId_idx" ON "illegal_action_types"("guildId");

-- CreateIndex
CREATE INDEX "illegal_actions_cityId_idx" ON "illegal_actions"("cityId");

-- CreateIndex
CREATE INDEX "inventory_items_locationId_idx" ON "inventory_items"("locationId");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "inventory_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_locations" ADD CONSTRAINT "inventory_locations_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "illegal_actions" ADD CONSTRAINT "illegal_actions_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "illegal_action_cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "illegal_actions" ADD CONSTRAINT "illegal_actions_actionTypeId_fkey" FOREIGN KEY ("actionTypeId") REFERENCES "illegal_action_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "illegal_action_cities" ADD CONSTRAINT "illegal_action_cities_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "illegal_action_types" ADD CONSTRAINT "illegal_action_types_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "illegal_action_cities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "illegal_action_types" ADD CONSTRAINT "illegal_action_types_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
