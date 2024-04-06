/* global db NotificationUser */
const { CommonErrStatus } = require('../../model/error');
const { v4: uuidv4 } = require('uuid');
const { RespError, RespSuccess, RespData } = require('../../model/resp');
const { Query } = require('../../db/query');

// 查询分组下的好友信息
const getFriendByGroup = async group_id => {
	const sql = 'select * from friend where group_id=?';
	const { results } = await Query(sql, [group_id]);
	return results;
};
// 添加好友
const addFriendRecord = async (friendInfo, res) => {
	const sqlStr = 'insert into friend set ?';
	const { err, results } = await Query(sqlStr, friendInfo);
	// 执行 SQL 语句失败了
	if (err) return err;
	if (results.affectedRows === 1) {
		if (err) return RespError(res, CommonErrStatus.SERVER_ERR);
		if (results.affectedRows === 1) {
			return '';
		}
		return '创建失败';
	}
};

/**
 * 查询用户的基本逻辑：
 * 1. 查询用户表, 模糊查询
 * 2. 判断查询出来的数据中, 判断是否存在已经好友的现象
 * 3. 筛选出已经是好友的和不是好友的，非好友的才能添加
 */
const searchUser = async (req, res) => {
	// 获取当前登录的用户信息、模糊查询关键字
	const { sender, username } = req.body;
	let sql = 'select * from user where username like ?';
	const { err, results } = await Query(sql, [`%${username}%`]);
	// 查询数据失败
	if (err) return RespError(res, CommonErrStatus.SERVER_ERR);
	const searchList = [];
	if (results.length !== 0) {
		sql = 'select id from friend_group  where user_id=?';
		for (const userInfo of results) {
			let flag = false;
			// 如果是自己，跳过
			if (userInfo.username === sender.username) {
				continue;
			}
			const res = await Query(sql, [sender.id]);
			const { err, results } = await Query(sql, [sender.id]);
			// 查询数据失败
			if (err) return RespError(res, CommonErrStatus.SERVER_ERR);
			for (const item of results) {
				const friends = await getFriendByGroup(item.id);
				for (const item2 of friends) {
					if (item2.username === userInfo.username) {
						flag = true;
						// 已经是朋友了
						break;
					}
				}
				if (flag) {
					break;
				}
			}
			// 返回的信息：昵称、用户名、用户 id、用户头像、是否是好友
			searchList.push({
				name: userInfo.name,
				username: userInfo.username,
				id: userInfo.id,
				avatar: userInfo.avatar,
				status: flag
			});
		}
	}
	RespData(res, searchList);
};
/**
 * 添加好友的基本逻辑：
 * 1. 首先将好友添加到自己的好友列表中
 * 2. 然后将自己也插入到别人的好友列表中
 */
const addFriend = async (req, res) => {
	// 获取发送方信息、好友 id、好友用户名、好友头像（注意：好友备注及好友分组是默认值）
	const { sender, id, username, avatar } = req.body;
	// 获取发送方所有的，以便将好友添加到默认分组中
	let sql = 'select id from friend_group  where user_id=?';
	const { results: results1 } = await Query(sql, [sender.id]);
	const uuid = uuidv4();

	// 将好友添加到自己的好友列表中
	const friendInfo1 = {
		user_id: id,
		username: username,
		avatar: avatar,
		remark: username,
		group_id: results1[0].id,
		room: uuid
	};
	const { err } = await addFriendRecord(friendInfo1);
	if (err) {
		return RespError(res, CommonErrStatus.CREATE_ERR);
	}

	// 将自己添加到对方好友列表里
	sql = 'select id,user_id,name from friend_group where user_id=?';
	const { results: results2 } = await Query(sql, [id]);
	const friendInfo2 = {
		user_id: sender.id,
		username: sender.username,
		avatar: sender.avatar,
		remark: sender.username,
		group_id: results2[0].id,
		room: uuid
	};
	const { err: err2 } = await addFriendRecord(friendInfo2);
	if (err2) {
		return RespError(res, CommonErrStatus.CREATE_ERR);
	}
	// 通知自己，让好友列表进行更新
	NotificationUser({ receiver_username: sender.username, name: 'friendList' });
	// 通知对方, 让其好友列表进行更新
	NotificationUser({ receiver_username: username, name: 'friendList' });
	return RespSuccess(res);
};
/**
 * 获取好友列表的基本逻辑：
 * 1. 根据当前用户的 id 获取其所有好友分组的 id 和 name
 * 2. 然后再根据 getFriendList 传入好友分组的 id 获得相应的好友, 最后插入到 friendList 中
 */
const getFriendList = async (req, res) => {
	// 根据 id 获取所有分组下的所有好友
	const id = req.user.id;
	const sql = 'select id,name from friend_group where user_id=?';
	db.query(sql, [id], async (err, results) => {
		// 查询数据失败
		if (err) return RespError(res, CommonErrStatus.SERVER_ERR);
		// 查询数据成功
		// 注意：如果执行的是 select 查询语句，则执行的结果是数组
		const friendList = [];
		if (results.length !== 0) {
			for (const item of results) {
				const friend = { name: item.name, online_counts: 0, friend: [] };
				const friends = await getFriendByGroup(item.id);
				for (const item2 of friends) {
					friend.friend.push(item2);
					if (item2.online_status === 'online') {
						friend.online_counts++;
					}
				}
				friendList.push(friend);
			}
		}
		return RespData(res, friendList);
	});
};
/**
 * 获取当前用户的分组列表
 */
const getFriendGroupList = async (req, res) => {
	const user_id = req.user.id;
	const sql = 'select * from friend_group where user_id=?';
	const { err, results } = await Query(sql, [user_id]);
	// 查询数据失败
	if (err) return RespError(res, CommonErrStatus.SERVER_ERR);
	RespData(res, results);
};
/**
 * 添加好友分组
 */
const createFriendGroup = async (req, res) => {
	const friend_group = req.body;
	const sql = 'insert into friend_group set ?';
	const { err, results } = await Query(sql, friend_group);
	// 查询数据失败
	if (err) return RespError(res, CommonErrStatus.SERVER_ERR);
	if (results.affectedRows === 1) {
		return RespSuccess(res);
	}
};
/**
 * 根据好友 id 获取好友信息
 */
const getFriendById = async (req, res) => {
	const { id } = req.query;
	const sql =
		'select f.id as friend_id, f.user_id as friend_user_id, f.online_status, f.remark, f.group_id, fg.name as group_name, f.room, f.unread_msg_count, u.username, u.avatar, u.phone, u.name, u.signature from friend as f join user as u on f.user_id = u.id join friend_group as fg on f.group_id = fg.id where f.id = ?';
	const { err, results } = await Query(sql, [id]);
	// 查询数据失败
	if (err) return RespError(res, CommonErrStatus.SERVER_ERR);
	RespData(res, results[0]);
};
/**
 * 根据好友 username 获取好友信息
 */
const getFriendByUsername = async (req, res) => {
	const { friend_username, self_username } = req.query;
	const sql =
		'select * from friend where username = ? and group_id in (select id from friend_group where username = ?)';
	const { err, results } = await Query(sql, [friend_username, self_username]);
	// 查询数据失败
	if (err) return RespError(res, CommonErrStatus.SERVER_ERR);
	RespData(res, results[0]);
};
/**
 * 修改好友信息（备注、分组）
 */
const updateFriend = async (req, res) => {
	const { friend_id, remark, group_id } = req.body;
	const sql = 'update friend set remark=?, group_id=? where id=?';
	const { err, results } = await Query(sql, [remark, group_id, friend_id]);
	// 查询数据失败
	if (err) return RespError(res, CommonErrStatus.UPDATE_ERR);
	if (results.affectedRows === 1) {
		return RespSuccess(res);
	}
};

module.exports = {
	getFriendList,
	getFriendGroupList,
	createFriendGroup,
	searchUser,
	addFriend,
	getFriendById,
	getFriendByUsername,
	updateFriend
};
