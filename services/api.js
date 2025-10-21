export const chatAPI = {
  async sendQuestion(question) {
    return {
      answer: "This is a dummy answer.",
      sources: ["dummy source 1", "dummy source 2"],
      links: ["dummy link 1", "dummy link 2"],
      success: true,
    };
  },
};
