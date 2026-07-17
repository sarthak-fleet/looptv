import type { MetadataRoute } from 'next';
import stations from '../../channels.config';

export const dynamic = 'force-static';

const siteUrl = 'https://tv.significanthobbies.com';

export default function sitemap(): MetadataRoute.Sitemap {
  const stationRoutes: MetadataRoute.Sitemap = stations.map((s) => ({
    url: `${siteUrl}/${s.id}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.8,
  }));

  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteUrl}/catalog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...stationRoutes,
  ];
}
