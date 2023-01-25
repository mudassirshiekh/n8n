import express from 'express';

import request from 'supertest';
import type { Role } from '@db/entities/Role';
import {
	REST_PATH_SEGMENT,
	ROUTES_REQUIRING_AUTHENTICATION,
	ROUTES_REQUIRING_AUTHORIZATION,
} from './shared/constants';
import * as testDb from './shared/testDb';
import * as utils from './shared/utils';

let app: express.Application;
let globalMemberRole: Role;

beforeAll(async () => {
	app = await utils.initTestServer({
		applyAuth: true,
		endpointGroups: ['me', 'auth', 'owner', 'users'],
	});
	await testDb.init();

	globalMemberRole = await testDb.getGlobalMemberRole();

	utils.initTestLogger();
	await utils.initTestTelemetry();
});

afterAll(async () => {
	await testDb.terminate();
});

ROUTES_REQUIRING_AUTHENTICATION.concat(ROUTES_REQUIRING_AUTHORIZATION).forEach((route) => {
	const [method, endpoint] = getMethodAndEndpoint(route);

	test(`${route} should return 401 Unauthorized if no cookie`, async () => {
		const response = await request(app)[method](endpoint).use(utils.prefix(REST_PATH_SEGMENT));

		expect(response.statusCode).toBe(401);
	});
});

ROUTES_REQUIRING_AUTHORIZATION.forEach(async (route) => {
	const [method, endpoint] = getMethodAndEndpoint(route);

	test(`${route} should return 403 Forbidden for member`, async () => {
		const member = await testDb.createUser({ globalRole: globalMemberRole });
		const response = await utils.createAuthAgent(app, member)[method](endpoint);

		expect(response.statusCode).toBe(403);
	});
});

function getMethodAndEndpoint(route: string) {
	return route.split(' ').map((segment, index) => {
		return index % 2 === 0 ? segment.toLowerCase() : segment;
	});
}
