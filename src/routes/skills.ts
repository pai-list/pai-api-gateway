/**
 * Skills Marketplace Routes
 * 
 * Handles skill discovery, installation, and management.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { HTTPException } from 'hono/http-exception';

const skillsRoutes = new Hono();

// Validation schemas
const SearchSkillsSchema = z.object({
  q: z.string().optional(),
  tier: z.enum(['free', 'basic', 'pro', 'enterprise']).optional(),
  category: z.string().optional(),
  author: z.string().optional(),
  minRating: z.number().min(0).max(5).optional(),
  maxPrice: z.number().min(0).optional(),
  sort: z.enum(['rating', 'price', 'installs', 'updated', 'created']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
});

const InstallSkillSchema = z.object({
  skillId: z.string().min(1),
  version: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

const UpdateSkillSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional(),
  tier: z.enum(['free', 'basic', 'pro', 'enterprise']).optional(),
  pricePi: z.number().min(0).optional(),
  version: z.string().optional(),
  changelog: z.string().optional(),
  configSchema: z.record(z.unknown()).optional(),
});

// Mock skills database (in production, use D1 or KV)
const mockSkills = [
  {
    id: 'skill-1',
    slug: 'research-bot',
    name: 'ResearchBot',
    description: 'Automated research agent that searches, summarizes, and cites sources',
    tier: 'PRO',
    pricePi: 5,
    version: '1.2.0',
    installCount: 42,
    avgRating: 4.5,
    ratingCount: 10,
    authorId: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    tags: ['research', 'ai', 'automation'],
    configSchema: {
      type: 'object',
      properties: {
        maxSources: { type: 'number', default: 10 },
        depth: { type: 'string', enum: ['quick', 'deep'], default: 'deep' },
        language: { type: 'string', default: 'en' },
      },
    },
  },
  {
    id: 'skill-2',
    slug: 'code-reviewer',
    name: 'CodeReviewer',
    description: 'Automated code review agent for PRs',
    tier: 'PRO',
    pricePi: 10,
    version: '2.1.0',
    installCount: 28,
    avgRating: 4.8,
    ratingCount: 15,
    authorId: 'user-2',
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    tags: ['code-review', 'github', 'ai'],
    configSchema: {
      type: 'object',
      properties: {
        severity: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
        autoApprove: { type: 'boolean', default: false },
      },
    },
  },
  {
    id: 'skill-3',
    slug: 'payment-processor',
    name: 'PaymentProcessor',
    description: 'Secure Pi Network payment processing with escrow',
    tier: 'PRO',
    pricePi: 15,
    version: '1.0.0',
    installCount: 12,
    avgRating: 4.9,
    ratingCount: 8,
    authorId: 'user-3',
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-07-10T00:00:00.000Z',
    tags: ['payments', 'pi-network', 'escrow'],
    configSchema: {
      type: 'object',
      properties: {
        autoApprove: { type: 'boolean', default: false },
        maxAmount: { type: 'number', default: 100 },
      },
    },
  },
];

// GET /api/v1/skills - Search and list skills
skillsRoutes.get('/', async (c) => {
  try {
    const query = c.req.query();
    const {
      q,
      tier,
      category,
      author,
      minRating,
      maxPrice,
      sort = 'rating',
      order = 'desc',
      limit = '20',
      offset = '0',
    } = c.req.query();

    let results = [...mockSkills];

    // Filter by query
    if (c.req.query('q')) {
      const query = c.req.query('q').toLowerCase();
      results = results.filter(s => 
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Filter by tier
    if (tier) {
      results = results.filter(s => s.tier === tier);
    }

    // Filter by author
    if (author) {
      results = results.filter(s => s.authorId === author);
    }

    // Filter by min rating
    if (minRating) {
      results = results.filter(s => s.avgRating >= Number(minRating));
    }

    // Filter by max price
    if (maxPrice) {
      results = results.filter(s => s.pricePi <= Number(maxPrice));
    }

    // Sort
    results.sort((a, b) => {
      let aVal = a[sort];
      let bVal = b[sort];
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      if (order === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

    // Pagination
    const pageLimit = Math.min(Math.max(1, Number(limit)), 100);
    const pageOffset = Math.max(0, Number(offset));
    const total = results.length;
    const results_page = results.slice(pageOffset, pageOffset + pageLimit);

    return c.json({
      success: true,
      data: {
        skills: results_page,
        pagination: {
          total,
          limit: pageLimit,
          offset: pageOffset,
          hasMore: pageOffset + pageLimit < total,
        },
      },
    }, 200);
  } catch (error) {
    throw new Error(`Failed to search skills: ${error.message}`);
  }
});

// GET /api/v1/skills/:id
  skillsRoutes.get('/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const skill = mockSkills.find(s => s.id === id);
    
    if (!skill) {
      throw new Error('Skill not found');
    }

    return c.json({
      success: true,
      data: skill,
    }, 200);
  } catch (error) {
    throw new Error(`Failed to get skill: ${error.message}`);
  }
});

// POST /api/v1/skills - Install a skill

skillsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { skillId, version, config } = z.object({
      skillId: z.string().min(1),
      version: z.string().optional(),
      config: z.record(z.unknown()).optional(),
    }).parse(body);
    
    // TODO: Implement actual skill installation
    return c.json({
      success: true,
      message: 'Skill installed successfully (mock)',
      data: {
        skillId: c.req.param('skillId') || body.skillId,
        version: body.version || 'latest',
        config: body.config || {},
        installedAt: new Date().toISOString(),
        instanceId: `inst_${Date.now()}`,
      },
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// PUT /api/v1/skills/:id - Update skill (author only)

skillsRoutes.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const data = UpdateSkillSchema.parse(body);
    
    // TODO: Implement actual skill update with authorization check
    // For now, return mock response
    return c.json({
      success: true,
      message: 'Skill updated successfully (mock)',
      data: {
        id,
        ...data,
        updatedAt: new Date().toISOString(),
      },
    }, 200);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// DELETE /api/v1/skills/:id - Uninstall skill
skillsRoutes.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // TODO: Implement actual skill uninstallation
    return c.json({
      success: true,
      message: 'Skill uninstalled successfully (mock)',
      data: {
        skillId: c.req.param('id'),
        uninstalledAt: new Date().toISOString(),
      },
    }, 200);
  } catch (error) {
    throw new Error(`Failed to uninstall skill: ${error.message}`);
  }
});

// GET /api/v1/skills/installed - List user's installed skills
skillsRoutes.get('/installed', async (c) => {
  // TODO: Get user's installed skills from database
  return c.json({
    success: true,
    data: {
      skills: [
        {
          skillId: 'skill-1',
          name: 'ResearchBot',
          version: '1.2.0',
          installedAt: '2026-07-01T12:00:00.000Z',
          config: { maxSources: 15, depth: 'deep' },
        },
        {
          skillId: 'skill-2',
          name: 'CodeReviewer',
          version: '2.1.0',
          installedAt: '2026-07-15T10:30:00.000Z',
          config: { severity: 'high', autoApprove: false },
        },
      ],
      total: 2,
    },
  }, 200);
});

// POST /api/v1/skills/:id/review - Rate/review a skill
const ReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

skillsRoutes.post('/:id/review', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { rating, comment } = z.object({
      rating: z.number().min(1).max(5),
      comment: z.string().max(1000).optional(),
    }).parse(body);
    
    // TODO: Save review to database
    return c.json({
      success: true,
      message: 'Review submitted successfully (mock)',
      data: {
        skillId: c.req.param('id'),
        rating,
        comment: body.comment || '',
        submittedAt: new Date().toISOString(),
      },
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation error: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

export { skillsRoutes };