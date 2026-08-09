This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Configuration design-v2

Les évolutions covoiturage et hébergement utilisent deux migrations additives :

1. `supabase/carpool_management_migration.sql`
2. `supabase/lodging_guest_assignments_migration.sql`

La gestion privée des trajets fonctionne sans clé exposée au navigateur. Pour envoyer automatiquement les liens conducteurs, ajouter sur Vercel :

```text
RESEND_API_KEY=re_...
CARPOOL_EMAIL_FROM=Damien & Julie <covoiturage@votre-domaine.fr>
```

`CARPOOL_EMAIL_FROM` doit utiliser un domaine validé dans Resend. Sans ces deux variables, l’annonce reste créée et son lien privé est affiché immédiatement au conducteur, mais aucun e-mail n’est envoyé.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
