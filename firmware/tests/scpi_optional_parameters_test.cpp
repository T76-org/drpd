#include <cassert>
#include <string>
#include <vector>

#include <t76/scpi_interpreter.hpp>

namespace T76::SCPI {

class OptionalParameterTarget {
public:
    void handle(const std::vector<ParameterValue>& parameters) {
        observedCounts.push_back(parameters.size());
    }

    std::vector<size_t> observedCounts;
};

namespace {
const ParameterDescriptor parameters[] = {
    {.type = ParameterType::Number},
    {.type = ParameterType::String},
    {.type = ParameterType::String},
};
const TrieNode children[] = {
    {'T', uint8_t(TrieNodeFlags::Terminal), 0, nullptr, 0},
};
}

template<>
const TrieNode Interpreter<OptionalParameterTarget>::_trie =
    {0, 0, 1, children, 0};

template<>
const Command<OptionalParameterTarget> Interpreter<OptionalParameterTarget>::_commands[] = {
    {&OptionalParameterTarget::handle, 3, 1, parameters},
};

template<>
const size_t Interpreter<OptionalParameterTarget>::_commandCount = 1;

template<>
const size_t Interpreter<OptionalParameterTarget>::_maxParameterCount = 3;

}

using namespace T76::SCPI;

static void submit(Interpreter<OptionalParameterTarget>& interpreter, std::string command) {
    command.push_back('\n');
    for (const char byte : command) interpreter.processInputCharacter(byte);
}

int main() {
    OptionalParameterTarget target;
    Interpreter<OptionalParameterTarget> interpreter(target);

    submit(interpreter, "T 1");
    submit(interpreter, "T 1,\"one\"");
    submit(interpreter, "T 1,\"one\",\"two\"");
    assert((target.observedCounts == std::vector<size_t>{1, 2, 3}));

    submit(interpreter, "T");
    assert(!interpreter.errorQueue.empty());
    assert(interpreter.errorQueue.front().starts_with("-109,"));
    interpreter.errorQueue.pop();

    submit(interpreter, "T 1,\"one\",\"two\",\"extra\"");
    assert(!interpreter.errorQueue.empty());
    assert(interpreter.errorQueue.front().starts_with("-108,"));
}
