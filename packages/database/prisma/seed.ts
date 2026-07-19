// packages/database/prisma/seed.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed de planos de assinatura...');

  // Seção 17.2 do PLAN.md: apenas Standard e Business — sem plano Free.
  // Preços em centavos (BRL). Valores de ponto de partida — validar com o nicho antes de lançar.
  const plans = [
    {
      code: 'standard',
      name: 'Standard',
      priceCents: 7990, // ~R$ 79,90/mês
      currency: 'BRL',
      features: {
        // Features iguais nos dois planos para as funcionalidades centrais (seção 17.2)
        customWebhookEnabled: false,
        queuePriority: false,
        centralHistoryDays: 90,
        maxBillingAdmins: 1,
      },
    },
    {
      code: 'business',
      name: 'Business',
      priceCents: 14990, // ~R$ 149,90/mês
      currency: 'BRL',
      features: {
        customWebhookEnabled: true,  // Feature-bandeira do plano Business (seção 18.3)
        queuePriority: true,
        centralHistoryDays: -1,      // Ilimitado
        maxBillingAdmins: -1,        // Vários
      },
    },
  ];

  for (const plan of plans) {
    const upserted = await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceCents: plan.priceCents,
        currency: plan.currency,
        features: plan.features,
      },
      create: {
        code: plan.code,
        name: plan.name,
        priceCents: plan.priceCents,
        currency: plan.currency,
        features: plan.features,
      },
    });
    console.log(`Plano cadastrado/atualizado: ${upserted.code} (${upserted.name})`);
  }

  console.log('Seed de planos concluído com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro ao executar seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
