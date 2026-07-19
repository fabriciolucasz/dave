-- AlterTable
ALTER TABLE "guilds" ADD COLUMN     "botPresent" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: marca como botPresent = true toda guild que já tem um audit_log
-- 'bot.joined' (escrito unicamente por handleGuildOnboarding). Esse é um sinal
-- mais preciso que a existência de Subscription, já que Subscription pode ter
-- sido criada via checkout do dashboard sem o bot nunca ter entrado no servidor.
UPDATE guilds SET "botPresent" = true
WHERE EXISTS (
  SELECT 1 FROM audit_logs
  WHERE audit_logs."guildId" = guilds.id
    AND audit_logs.action = 'bot.joined'
);
