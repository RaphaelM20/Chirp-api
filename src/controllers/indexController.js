const { body, validationResult, matchedData } = require("express-validator");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const prisma = require("../../db/prisma");
const jwt = require("jsonwebtoken");
const { json } = require("express");
const { tr } = require("@faker-js/faker");
const e = require("express");

const MAX_CONTENT_LENGTH = 280;
const MAX_NAME_LENGTH = 50;
const MAX_BIO_LENGTH = 160;

// Letters (any language), spaces, hyphens, apostrophes and periods,
// starting with a letter: "Jane Doe", "Mary-Jane", "O'Brien", "Dr. Who".
const NAME_PATTERN = /^\p{L}[\p{L} .'-]*$/u;

// Route params are strings; anything that isn't a positive integer is
// rejected before it reaches Prisma (parseInt("abc") is NaN, which Prisma
// either throws on or silently turns into a null relation).
function parseId(value) {
  return /^\d+$/.test(String(value)) ? Number(value) : null;
}

function sendError(res, status, message, path) {
  return res
    .status(status)
    .json({ errors: [{ msg: message, message, ...(path ? { path } : {}) }] });
}

function sendValidationErrors(req, res) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return false;
  res.status(400).json({ errors: errors.array() });
  return true;
}

const validateContent = [
  body("content")
    .isString()
    .withMessage("Content is required")
    .bail()
    .trim()
    .isLength({ min: 1 })
    .withMessage("Content can't be empty")
    .isLength({ max: MAX_CONTENT_LENGTH })
    .withMessage(`Content must be ${MAX_CONTENT_LENGTH} characters or fewer`),
];

const validateSignUp = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .bail()
    .isLength({ max: MAX_NAME_LENGTH })
    .withMessage(`Name must be ${MAX_NAME_LENGTH} characters or fewer`)
    .matches(NAME_PATTERN)
    .withMessage("Name can only contain letters, spaces, hyphens and apostrophes"),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Please enter a valid email address"),
  body("username")
    .trim()
    .matches(/^[a-zA-Z0-9 ]+$/)
    .withMessage("Please include only letters, numbers, and spaces")
    .isLength({ min: 4, max: 20 })
    .withMessage("Name must be between 4 and 20 characters"),
  body("password")
    .trim()
    .isLength({ min: 6, max: 20 })
    .withMessage("Password must be between 6 and 20 characters"),
  body("confirmPass")
    .trim()
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),
];

const signupPost = [
  validateSignUp,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        errors: errors.array(),
        data: req.body,
      });
    }
    const { name, email, username, password } = matchedData(req);
    const hashedPassword = await bcrypt.hash(password, 10);

    const existingEmail = await prisma.user.findUnique({
      where: { email: email },
    });

    const existingUsername = await prisma.user.findUnique({
      where: { username: username },
    });

    if (existingEmail) {
      return res.status(400).json({
        errors: [{ message: "Email already in use" }],
        data: req.body,
      });
    } else if (existingUsername) {
      return res.status(400).json({
        errors: [{ message: "Username already in use" }],
        data: req.body,
      });
    }

    const newUser = await prisma.user.create({
      data: {
        name: name,
        email: email,
        username: username,
        password: hashedPassword,
      },
    });

    const token = jwt.sign({ id: newUser.id }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    return res.status(201).json({ token: token });
  },
];

async function loginPost(req, res) {
  const token = jwt.sign({ id: req.user.id }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
  return res.json({ token: token });
}

// Pagination -------------------------------------------------------------
//
// Paginated endpoints take `?limit=` (1–50, default 20) and `?cursor=` (the
// id of the last item from the previous page) and respond with
// `{ items, nextCursor }`, where `nextCursor` is null on the last page.

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Returns { take, cursor } or null when the query params are invalid.
function parsePage(query) {
  const limit = query.limit === undefined ? DEFAULT_PAGE_SIZE : parseId(query.limit);
  const cursor = query.cursor === undefined ? null : parseId(query.cursor);
  if (limit === null || limit < 1 || (query.cursor !== undefined && cursor === null)) {
    return null;
  }
  return { take: Math.min(limit, MAX_PAGE_SIZE), cursor };
}

// Fetches one extra row to learn whether another page exists.
async function findPage(model, args, { take, cursor }) {
  const rows = await model.findMany({
    ...args,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, take);
  const nextCursor = rows.length > take ? items[items.length - 1].id : null;
  return { items, nextCursor };
}

// Shape used by post cards: counts come from the comment/like id lists.
const POST_CARD_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  userId: true,
  user: { select: { id: true, name: true, username: true, picture: true } },
  comments: { select: { id: true } },
  likes: { select: { id: true, userId: true } },
};

// Newest first, with id as a tiebreaker so cursors are stable.
const NEWEST_FIRST = [{ createdAt: "desc" }, { id: "desc" }];

async function allPostsGet(req, res) {
  const following = await prisma.follow.findMany({
    where: { followerId: req.user.id },
    select: { followingId: true },
  });

  const followingIds = following.map((f) => f.followingId);
  const where = { userId: { in: [...followingIds, req.user.id] } };

  // Paginated when `limit` or `cursor` is given; otherwise the original
  // unpaginated array, for clients that predate pagination.
  if (req.query.limit !== undefined || req.query.cursor !== undefined) {
    const page = parsePage(req.query);
    if (!page) return sendError(res, 400, "Invalid pagination parameters");
    return res.json(
      await findPage(prisma.post, { where, select: POST_CARD_SELECT, orderBy: NEWEST_FIRST }, page),
    );
  }

  const allPosts = await prisma.post.findMany({
    where: {
      userId: { in: [...followingIds, req.user.id] },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          picture: true,
        },
      },
      comments: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          user: {
            select: {
              picture: true,
              name: true,
              username: true,
            },
          },
        },
      },
      likes: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return res.json(allPosts);
}

// Every post from everyone, newest first.
async function explorePostsGet(req, res) {
  const page = parsePage(req.query);
  if (!page) return sendError(res, 400, "Invalid pagination parameters");
  return res.json(
    await findPage(prisma.post, { select: POST_CARD_SELECT, orderBy: NEWEST_FIRST }, page),
  );
}

// One tab of a profile: posts, replies or liked posts.
async function profileTabGet(req, res) {
  const page = parsePage(req.query);
  if (!page) return sendError(res, 400, "Invalid pagination parameters");

  const user = await prisma.user.findUnique({
    where: { username: req.params.username },
    select: { id: true },
  });
  if (!user) return sendError(res, 404, "User not found");

  switch (req.params.tab) {
    case "posts":
      return res.json(
        await findPage(
          prisma.post,
          { where: { userId: user.id }, select: POST_CARD_SELECT, orderBy: NEWEST_FIRST },
          page,
        ),
      );
    case "replies":
      return res.json(
        await findPage(
          prisma.comment,
          {
            where: { userId: user.id },
            orderBy: NEWEST_FIRST,
            select: {
              id: true,
              content: true,
              createdAt: true,
              userId: true,
              postId: true,
              likes: { select: { id: true, userId: true } },
              post: { select: POST_CARD_SELECT },
            },
          },
          page,
        ),
      );
    case "likes":
      // Liked posts only; likes on replies aren't shown on profiles.
      return res.json(
        await findPage(
          prisma.like,
          {
            where: { userId: user.id, postId: { not: null } },
            orderBy: { id: "desc" },
            select: { id: true, userId: true, postId: true, post: { select: POST_CARD_SELECT } },
          },
          page,
        ),
      );
    default:
      return sendError(res, 404, "Unknown profile tab");
  }
}

const createPost = [
  validateContent,
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    const { content } = matchedData(req);
    const post = await prisma.post.create({
      data: {
        content,
        userId: req.user.id,
      },
    });
    return res.json(post);
  },
];

async function deletePost(req, res) {
  const postId = parseId(req.params.postId);
  if (postId === null) return sendError(res, 400, "Invalid post id");

  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { userId: true },
  });
  if (!post) return sendError(res, 404, "Post not found");
  if (post.userId !== req.user.id) {
    return sendError(res, 403, "You can only delete your own posts");
  }

  // Comments reference posts with ON DELETE RESTRICT, so remove the post's
  // likes (including likes on its replies) and replies first, atomically.
  await prisma.$transaction([
    prisma.like.deleteMany({
      where: { OR: [{ postId }, { comment: { postId } }] },
    }),
    prisma.comment.deleteMany({ where: { postId } }),
    prisma.post.delete({ where: { id: postId } }),
  ]);
  return res.json({ count: 1 });
}

async function currentUserGet(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      username: true,
      picture: true,
      bio: true,
      following: {
        select: { followingId: true },
      },
      followers: {
        select: { followerId: true },
      },
    },
  });
  return res.json(user);
}

const validateProfileUpdate = [
  body("name")
    .isString()
    .withMessage("Name is required")
    .bail()
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .bail()
    .isLength({ max: MAX_NAME_LENGTH })
    .withMessage(`Name must be ${MAX_NAME_LENGTH} characters or fewer`),
  body("username")
    .isString()
    .withMessage("Username is required")
    .bail()
    .trim()
    // Existing usernames predate the signup rules, so only a new username
    // has to satisfy them.
    .custom((value, { req }) => {
      if (value === req.user.username) return true;
      if (!/^[a-zA-Z0-9 ]+$/.test(value)) {
        throw new Error("Please include only letters, numbers, and spaces");
      }
      if (value.length < 4 || value.length > 20) {
        throw new Error("Username must be between 4 and 20 characters");
      }
      return true;
    })
    .bail()
    .custom(async (value, { req }) => {
      if (value === req.user.username) return true;
      const existing = await prisma.user.findUnique({
        where: { username: value },
        select: { id: true },
      });
      if (existing) throw new Error("Username already in use");
      return true;
    }),
  body("picture")
    .optional({ values: "falsy" })
    .trim()
    .isURL({ protocols: ["http", "https"], require_protocol: true })
    .withMessage("Picture must be an http(s) URL"),
  body("bio")
    .optional({ values: "null" })
    .isString()
    .trim()
    .isLength({ max: MAX_BIO_LENGTH })
    .withMessage(`Bio must be ${MAX_BIO_LENGTH} characters or fewer`),
];

const currentUserPut = [
  validateProfileUpdate,
  async (req, res) => {
    if (sendValidationErrors(req, res)) return;
    const { name, username, picture, bio } = matchedData(req);
    try {
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: { name, username, picture: picture || null, bio: bio ?? "" },
        // Never return the password hash.
        select: { id: true, name: true, username: true, picture: true, bio: true },
      });
      return res.json(user);
    } catch (err) {
      // Another request claimed the username between validation and update.
      if (err.code === "P2002") {
        return sendError(res, 400, "Username already in use", "username");
      }
      throw err;
    }
  },
];

//likes

// Liking is idempotent: a second like from the same user returns the
// existing like instead of creating a duplicate.
async function likePost(req, res) {
  const postId = parseId(req.params.id);
  if (postId === null) return sendError(res, 400, "Invalid post id");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true },
  });
  if (!post) return sendError(res, 404, "Post not found");

  const existing = await prisma.like.findFirst({
    where: { userId: req.user.id, postId },
  });
  if (existing) return res.json(existing);

  const like = await prisma.like.create({
    data: {
      userId: req.user.id,
      postId,
    },
  });
  return res.json(like);
}

async function unlikePost(req, res) {
  const postId = parseId(req.params.id);
  if (postId === null) return sendError(res, 400, "Invalid post id");
  const unlike = await prisma.like.deleteMany({
    where: {
      userId: req.user.id,
      postId,
    },
  });
  return res.json(unlike);
}

async function likeComment(req, res) {
  const commentId = parseId(req.params.id);
  if (commentId === null) return sendError(res, 400, "Invalid comment id");
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true },
  });
  if (!comment) return sendError(res, 404, "Comment not found");

  const existing = await prisma.like.findFirst({
    where: { userId: req.user.id, commentId },
  });
  if (existing) return res.json(existing);

  const like = await prisma.like.create({
    data: {
      userId: req.user.id,
      commentId,
    },
  });
  return res.json(like);
}

async function unlikeComment(req, res) {
  const commentId = parseId(req.params.id);
  if (commentId === null) return sendError(res, 400, "Invalid comment id");
  const unlike = await prisma.like.deleteMany({
    where: {
      userId: req.user.id,
      commentId,
    },
  });
  return res.json(unlike);
}

//comments

async function commentsGet(req, res) {
  const postId = parseId(req.params.id);
  if (postId === null) return sendError(res, 400, "Invalid post id");
  const comments = await prisma.comment.findMany({
    where: {
      postId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return res.json(comments);
}

const commentsPost = [
  validateContent,
  async (req, res) => {
    const postId = parseId(req.params.id);
    if (postId === null) return sendError(res, 400, "Invalid post id");
    if (sendValidationErrors(req, res)) return;
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });
    if (!post) return sendError(res, 404, "Post not found");

    const { content } = matchedData(req);
    const comment = await prisma.comment.create({
      data: {
        content,
        userId: req.user.id,
        postId,
      },
    });
    return res.json(comment);
  },
];

async function profileGet(req, res) {
  // `?include=summary` returns the header data (bio, follow lists, post
  // count) without the full posts/replies/likes lists; clients page those
  // through /users/:username/:tab instead.
  if (req.query.include === "summary") {
    const summary = await prisma.user.findUnique({
      where: { username: req.params.username },
      select: {
        id: true,
        name: true,
        username: true,
        picture: true,
        bio: true,
        _count: { select: { posts: true } },
        followers: {
          select: {
            id: true,
            followerId: true,
            follower: { select: { id: true, name: true, username: true, picture: true } },
          },
        },
        following: {
          select: {
            id: true,
            followingId: true,
            following: { select: { id: true, name: true, username: true, picture: true } },
          },
        },
      },
    });
    if (!summary) return sendError(res, 404, "User not found");
    return res.json(summary);
  }

  const profile = await prisma.user.findUnique({
    where: { username: req.params.username },
    select: {
      id: true,
      name: true,
      username: true,
      picture: true,
      bio: true,
      posts: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          createdAt: true,
          userId: true,
          user: {
            select: { id: true, name: true, username: true, picture: true },
          },
          comments: {
            select: {
              id: true,
            },
          },
          likes: {
            select: {
              id: true,
              userId: true,
            },
          },
        },
      },
      comments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          content: true,
          createdAt: true,
          userId: true,
          postId: true,
          likes: {
            select: {
              id: true,
              userId: true,
            },
          },
          post: {
            select: {
              id: true,
              content: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  picture: true,
                },
              },
              likes: { select: { id: true, userId: true } },
              comments: { select: { id: true } },
            },
          },
        },
      },
      likes: {
        orderBy: { id: "desc" },
        select: {
          id: true,
          userId: true,
          postId: true,
          commentId: true,
          post: {
            select: {
              id: true,
              content: true,
              createdAt: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  picture: true,
                },
              },
              likes: {
                select: { id: true, userId: true },
              },
              comments: { select: { id: true } },
            },
          },
        },
      },
      followers: {
        select: {
          id: true,
          followerId: true,
          follower: {
            select: {
              id: true,
              name: true,
              username: true,
              picture: true,
            },
          },
        },
      },
      following: {
        select: {
          id: true,
          followingId: true,
          following: {
            select: {
              id: true,
              name: true,
              username: true,
              picture: true,
            },
          },
        },
      },
    },
  });

  if (!profile) return sendError(res, 404, "User not found");
  return res.json(profile);
}

async function followUser(req, res) {
  const follow = await prisma.follow.create({
    data: {
      followerId: req.user.id,
      followingId: req.body.followingId,
    },
  });
  return res.json(follow);
}

async function unfollowUser(req, res) {
  const unfollow = await prisma.follow.deleteMany({
    where: {
      followerId: req.user.id,
      followingId: req.body.followingId,
    },
  });
  return res.json(unfollow);
}

async function notFollowingUsersGet(req, res) {
  console.log("currentUserId:", req.user.id);
  const following = await prisma.follow.findMany({
    where: { followerId: req.user.id },
    select: {
      followingId: true,
    },
  });

  const followingIds = following.map((f) => f.followingId);

  const users = await prisma.user.findMany({
    where: {
      id: {
        notIn: [...followingIds, req.user.id],
      },
    },
    select: {
      id: true,
      name: true,
      username: true,
      picture: true,
      bio: true,
      followers: {
        select: { followerId: true },
      },
    },
  });
  console.log("followingIds:", followingIds);
  console.log("users", users);
  return res.json(users);
}

async function singlePostGet(req, res) {
  const postId = parseId(req.params.id);
  if (postId === null) return sendError(res, 400, "Invalid post id");
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      content: true,
      createdAt: true,
      userId: true,
      user: {
        select: {
          id: true,
          name: true,
          username: true,
          picture: true,
        },
      },
      comments: {
        select: {
          id: true,
          content: true,
          createdAt: true,
          userId: true,
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              picture: true,
            },
          },
          post: { select: { id: true } },
          likes: { select: { id: true, userId: true } },
        },
      },
      likes: {
        select: {
          id: true,
          userId: true,
          user: { select: { id: true } },
          post: { select: { id: true } },
          comment: { select: { id: true } },
        },
      },
    },
  });
  if (!post) return sendError(res, 404, "Post not found");
  return res.json(post);
}

module.exports = {
  signupPost,
  loginPost,
  allPostsGet,
  explorePostsGet,
  profileTabGet,
  createPost,
  deletePost,
  currentUserGet,
  currentUserPut,
  likePost,
  unlikePost,
  likeComment,
  unlikeComment,
  commentsGet,
  commentsPost,
  profileGet,
  followUser,
  unfollowUser,
  notFollowingUsersGet,
  singlePostGet,
};
