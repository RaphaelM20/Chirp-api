const { body, validationResult, matchedData } = require("express-validator");
const bcrypt = require("bcryptjs");
const passport = require("passport");
const prisma = require("../../db/prisma");
const jwt = require("jsonwebtoken");
const { json } = require("express");
const { tr } = require("@faker-js/faker");
const e = require("express");

const validateSignUp = [
  body("name").trim().isAlpha(),
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

async function allPostsGet(req, res) {
  const following = await prisma.follow.findMany({
    where: { followerId: req.user.id },
    select: { followingId: true },
  });

  const followingIds = following.map((f) => f.followingId);

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

async function createPost(req, res) {
  const post = await prisma.post.create({
    data: {
      content: req.body.content,
      userId: req.user.id,
    },
  });
  return res.json(post);
}

async function deletePost(req, res) {
  const post = await prisma.post.deleteMany({
    where: {
      id: parseInt(req.params.postId),
    },
  });
  return res.json(post);
}

async function currentUserGet(req, res) {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
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

async function currentUserPut(req, res) {
  const user = await prisma.user.update({
    where: { id: req.user.id },
    data: {
      name: req.body.name,
      username: req.body.username,
      picture: req.body.picture,
      bio: req.body.bio,
    },
  });
  return res.json(user);
}

//likes

async function likePost(req, res) {
  const like = await prisma.like.create({
    data: {
      userId: req.user.id,
      postId: parseInt(req.params.id),
    },
  });
  return res.json(like);
}

async function unlikePost(req, res) {
  const unlike = await prisma.like.deleteMany({
    where: {
      userId: req.user.id,
      postId: parseInt(req.params.id),
    },
  });
  return res.json(unlike);
}

async function likeComment(req, res) {
  const like = await prisma.like.create({
    data: {
      userId: req.user.id,
      commentId: parseInt(req.params.id),
    },
  });
  return res.json(like);
}

async function unlikeComment(req, res) {
  const unlike = await prisma.like.deleteMany({
    where: {
      userId: req.user.id,
      commentId: parseInt(req.params.id),
    },
  });
  return res.json(unlike);
}

//comments

async function commentsGet(req, res) {
  const comments = await prisma.comment.findMany({
    where: {
      postId: parseInt(req.params.id),
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return res.json(comments);
}

async function commentsPost(req, res) {
  const comment = await prisma.comment.create({
    data: {
      content: req.body.content,
      userId: req.user.id,
      postId: parseInt(req.params.id),
    },
  });
  return res.json(comment);
}

async function profileGet(req, res) {
  const profile = await prisma.user.findUnique({
    where: { username: req.params.username },
    select: {
      id: true,
      name: true,
      username: true,
      picture: true,
      bio: true,
      posts: {
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
  const post = await prisma.post.findUnique({
    where: { id: parseInt(req.params.id) },
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
  return res.json(post);
}

module.exports = {
  signupPost,
  loginPost,
  allPostsGet,
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
