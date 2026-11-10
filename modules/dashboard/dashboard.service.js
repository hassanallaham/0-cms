/**
 * @file Dashboard aggregates.
 *
 * Every number on the dashboard is a `COUNT`, so this module is the cheapest
 * read path in the app and the only one that touches all five tables at once.
 *
 * @module modules/dashboard/dashboard.service
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { db } from "../../db/knex.js";
import { config } from "../../config/index.js";
import * as postRepo from "../posts/post.repository.js";
import * as fileRepo from "../files/file.repository.js";
import { POST_STATUSES } from "../../utils/renderers.js";

/**
 * Headline counts plus the lists the dashboard shows.
 *
 * @param {Record<string, unknown>} [query]
 * @returns {Promise<object>} The dashboard view model.
 */
export async function overview(query = {}) {
	const limit = Math.min(
		Math.max(Number(query.limit ?? 5) || 5, 1),
		20,
	);

	const [
		postsTotal,
		filesTotal,
		categoriesTotal,
		tagsTotal,
		byStatus,
		recentPosts,
		recentFiles,
		orphanedBlobs,
	] = await Promise.all([
		db("posts").count({ n: "*" }).first().then((row) => Number(row?.n ?? 0)),
		db("files").count({ n: "*" }).first().then((row) => Number(row?.n ?? 0)),
		db("categories").count({ n: "*" }).first().then((row) => Number(row?.n ?? 0)),
		db("tags").count({ n: "*" }).first().then((row) => Number(row?.n ?? 0)),
		// One grouped query for every status, so the dashboard needs no N+1.
		db("posts")
			.groupBy("status")
			.select("status")
			.count({ n: "*" }),
		db("posts")
			.select(postRepo.POST_PICK_COLUMNS)
			.orderBy("updated_at", "desc")
			.limit(limit),
		db("files")
			.select(fileRepo.FILE_PICK_COLUMNS)
			.orderBy("created_at", "desc")
			.limit(limit),
		countOrphanedBlobs(),
	]);

	const statusCounts = Object.fromEntries(
		POST_STATUSES.map((status) => [
			status,
			Number(byStatus.find((row) => row.status === status)?.n ?? 0),
		]),
	);

	return {
		counts: {
			posts: postsTotal,
			files: filesTotal,
			categories: categoriesTotal,
			tags: tagsTotal,
			orphaned_blobs: orphanedBlobs,
		},
		posts_by_status: statusCounts,
		recent_posts: recentPosts,
		recent_files: recentFiles,
		config: {
			page_size: config.ui.pageSize,
			upload_max_mb: config.files.maxMb,
			allowed_mime: config.files.allowedMime,
			markdown_types: config.ui.markdownTypes,
		},
	};
}

/**
 * Count blobs on disk that no row points at.
 *
 * `store` writes the blob before the row, so a crash in that window leaves an
 * unreferenced file. Reporting the count lets the dashboard tell the truth about
 * disk use instead of hiding it.
 *
 * @returns {Promise<number>}
 */
export async function countOrphanedBlobs() {
	const known = await db("files").pluck("path");
	// Listed from `files.dir`, not `files.filesDir`, so the relative paths line up
	// with the `files/YYYY/MM/<uuid>` form stored in `files.path`.
	const onDisk = await listBlobPaths(config.files.dir);

	const referenced = new Set(known.map((path) => String(path).split(/[\\/]+/).join("/")));
	return onDisk.filter((path) => !referenced.has(path)).length;
}

/**
 * Recursively list every stored blob path, relative to `root`.
 *
 * @param {string} root
 * @param {string} [prefix] - Internal accumulator; relative path built so far.
 * @returns {Promise<string[]>}
 */
async function listBlobPaths(root, prefix = "") {
	/** @type {string[]} */
	const out = [];

	let entries = [];
	try {
		entries = await readdir(join(root, prefix), { withFileTypes: true });
	} catch {
		return out;
	}

	for (const entry of entries) {
		const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			out.push(...(await listBlobPaths(root, relative)));
		} else if (entry.isFile() && !entry.name.startsWith(".")) {
			out.push(relative);
		}
	}

	return out;
}
