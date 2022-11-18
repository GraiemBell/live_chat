//initialization after page finished to laod
function initAfterPageLoaded() {
  //check if a JWT is already store for this website
  const token = localStorage.getItem("token");
  const userName = localStorage.getItem("user-name");

  //a token was found
  if (token && userName) {
    setUserName(userName);
    initAfterLogin(token);
    return;
  }

  //no token is stored, then need to login to get a valid token
  hideOneLoader("main-loader");
  displaySignUpInForm("Login");
}

//initialization after successfull login
async function initAfterLogin(token) {
  //display init info inside friends section if no friends yet (chat list is empty)
  hideInfoOnEmptyChatList();
  displayInfoOnEmptyChatlist();

  //attach token to socket
  socket.auth = { token: token };

  //handle invitation request, in case this page was served by accessing an invitation link
  if (invitationInfoElement) {
    hideOneLoader("main-loader");
    handleInvitationRequest(invitationInfoElement.dataset);
    return;
  }

  //loading...
  hideSignUpInForm();
  displayMainLoader();

  //fetch messages for this user
  let chatList;
  let errorTitle;
  let errorMessage;
  try {
    chatList = await fetchChatList(token);
  } catch (error) {
    if (error.code) {
      //not authenticated or not authorized (token validation at server side failed)
      if (error.code === 401 || error.code === 403) {
        //loading stopped
        hideOneLoader("main-loader");
        displaySignUpInForm("Login"); //need to get a new valid token
      } else {
        //bad response
        errorTitle = "Ooooops...";
        errorMessage = error.message;
        //show error info
        hideOneLoader("main-loader");
        disaplayInitInfo(errorTitle, errorMessage, "Try Again");
      }
    } else {
      //technical error
      errorTitle = "Connection problems";
      errorMessage =
        "It was not possible to load your chats, because we could not reach the server. Maybe check your connection?";
      //show error info
      hideOneLoader("main-loader");
      disaplayInitInfo(errorTitle, errorMessage, "Try Again");
    }
    return;
  }

  //memorize chat list in global variable, add online status timer content for each chat
  chatListGlobal = chatList.map(function (chat) {
    return {
      ...chat,
      onlineStatusTimer: {
        timerId: null,
        active: false,
      },
      currentInput: "",
    };
  });

  //found some chats
  if (chatListGlobal.length !== 0) {
    displayChatList(chatListGlobal);
  }

  //some chats were found...
  hideOneLoader("main-loader");
  displayFriendsSection();

  //upgrade connection to websocket protocol
  socket.connect();

  //initialization done
  initializationDoneGlobal = true;
}

//fetch "all" user messages
async function fetchChatList(token) {
  let response;
  let error;

  //config ajax request
  const requestUrl = `/message/all`;
  const requestConfig = {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "CSRF-Token": csrfToken,
    },
    method: "POST",
    body: JSON.stringify({ token: token }),
  };

  //send ajax request
  response = await fetch(requestUrl, requestConfig);

  //parse response
  const responseData = await response.json();

  //response not ok
  if (!response.ok) {
    error = new Error();
    //401 (not authenticated), 403(not authorized), 404, 500, ...
    error.code = response.status;
    error.message = responseData.message;
    throw error;
  }

  //array of chats collected for this user
  return responseData.chatList;
}

//handle invitation request after accessing an invitation link
function handleInvitationRequest(invitationInfo) {
  if (!invitationInfo) {
    return;
  }
  //config
  let title;
  let info;
  let action;
  let optionalAction;
  //who issued this link?
  if (invitationInfo.inviterName) {
    //check if this user is trying to access a link generated by him/herself
    if (invitationInfo.inviterName === localStorage.getItem("user-name")) {
      title = "Nice try!";
      info =
        "This invitation link was generated by you. Please share it with another user, or go back to Your Chats";
      action = "Your Chats";
    } else {
      //the link was issued by another user
      title = `<b>${invitationInfo.inviterName}</b> wants to chat with you!`;
      info = `If you acept the invitation, you will join a new chat room with ${invitationInfo.inviterName}`;
      action = "Refuse";
      optionalAction = "Join Chat";
    }
  } else {
    //the user who issued this link was NOT found
    title = "Ooooops...";
    info =
      "This invitation link is not valid. Please get a new link, or go back to Your Chats";
    action = "Your Chats";
  }
  disaplayInitInfo(title, info, action, optionalAction);
}

//accept chat invitation by another user
async function joinChat(event) {
  //init
  hideInitErrorInfo();
  let response;

  //check if this user has a token, if not then login to get a new one
  const token = localStorage.getItem("token");
  const userName = localStorage.getItem("user-name");
  if (!token || !userName) {
    hideInitInfo();
    displaySignUpInForm("Login");
    return;
  }

  //config ajax request
  const requestUrl = `/room/join`;
  const requestBody = {
    token: token,
    invitationId: invitationInfoElement.dataset.invitationId,
  };
  const requestConfig = {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "CSRF-Token": csrfToken,
    },
    method: "POST",
    body: JSON.stringify(requestBody),
  };

  //display loader and disable buttons in this area
  const buttons = initInfoSectionElement
    .querySelector(".init-info")
    .querySelectorAll("button");

  displayInitInfoLoader();
  disableButtons(buttons, true);

  //send ajax request
  try {
    response = await fetch(requestUrl, requestConfig);
  } catch (error) {
    displayInitErrorInfo(
      "Can not reach the server. Maybe check your connection?"
    );
    //hide loader and re-enable buttons
    hideOneLoader("init-info-loader");
    disableButtons(buttons, false);
    return;
  }

  //response receive, hide loader and re-enable buttons
  hideOneLoader("init-info-loader");
  disableButtons(buttons, false);

  //parse response
  const responseData = await response.json();

  //response not ok
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      hideInitInfo();
      displaySignUpInForm("Login"); //need to get a new valid token
      return;
    }
    displayInitErrorInfo(responseData.message);
    return;
  }

  //response was ok
  history.replaceState(null, "", "/"); //update the currend url path with "/" (home page)
  lastInvitationIdAcceptedGlobal = invitationInfoElement.dataset.invitationId;
  invitationInfoElement = null; //finished to handle invitation request
  hideInitInfo();
  initAfterLogin(token); //request chats of this user
}
